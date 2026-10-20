import { calculateUrgency } from './urgencyScorer.js';
import { detectSupervisorRequest } from './supervisor.js';
import { CATEGORIES, URGENCY_LEVELS, REVIEW_VERDICTS } from './prompts.js';

export { CATEGORIES, URGENCY_LEVELS, REVIEW_VERDICTS };

/**
 * LLM Helper for triaging customer support messages
 * Using Groq API for AI-powered categorization and urgency scoring.
 *
 * The browser never holds the Groq key. It posts to /api/llm, a small server
 * function that keeps GROQ_API_KEY on the server and adds the prompts there.
 * (Before this change the key was a VITE_ variable, which Vite builds into the
 * public JavaScript where any visitor could copy it.)
 */

/**
 * Ask the server to run one model call. Returns the model's raw text.
 * Throws with a readable message when the AI service is unavailable.
 *
 * Under plain Node (tests and offline evaluation scripts) there is no /api
 * server, so it calls the same handler directly with GROQ_API_KEY.
 */
async function callModel(mode, payload) {
  if (typeof window === 'undefined') {
    const handlerPath = '../../server/llmHandler.js';
    const { handleLlmRequest } = await import(/* @vite-ignore */ handlerPath);
    const { status, body } = await handleLlmRequest({ mode, ...payload }, { apiKey: globalThis.process?.env?.GROQ_API_KEY });
    if (status !== 200) throw new Error(body.error);
    return body.content;
  }

  let response;
  try {
    response = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, ...payload }),
    });
  } catch {
    throw new Error('Could not reach the AI service.');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `AI service answered ${response.status}`);
  if (!body.content) throw new Error('Empty response from Groq');
  return body.content;
}

/**
 * Triage a customer support message using Groq AI.
 *
 * Asks the model for the category AND the urgency in one call: urgency depends
 * on meaning ("revenue is stopped", "our account was compromised") that keyword
 * rules cannot reliably detect. The rule-based scorer stays on as the fallback
 * for when the API is unavailable.
 *
 * Also reports whether the customer asked for a supervisor, which routes the
 * message for human review regardless of its urgency.
 *
 * `source` and `urgencySource` tell the caller which path produced the result
 * so the UI can be honest about it.
 *
 * @param {string} message - The customer support message
 * @returns {Promise<{category: string, urgency: string, supervisorRequested: boolean, reasoning: string, source: 'llm' | 'fallback', urgencySource: 'llm' | 'rules', error?: string}>}
 */
export async function triageMessage(message) {
  try {
    const content = await callModel('triage', { message });

    const parsed = parseTriage(content);

    return {
      category: parsed.category,
      // If the model omitted or mangled the urgency, score it with the rules
      // rather than showing nothing.
      urgency: parsed.urgency ?? calculateUrgency(message),
      urgencySource: parsed.urgency ? 'llm' : 'rules',
      // Same idea for the supervisor flag: fall back to the keyword check, and
      // treat either signal as a request so we err towards human review.
      supervisorRequested: parsed.supervisorRequested ?? detectSupervisorRequest(message),
      reasoning: parsed.reasoning,
      source: 'llm'
    };
  } catch (error) {
    console.warn('Groq API failed, using rule-based fallback:', error.message);
    return {
      ...getFallbackTriage(message),
      error: error.message
    };
  }
}

/** Rule-based triage used whenever the LLM path is unavailable. */
function getFallbackTriage(message) {
  return {
    ...getMockCategorization(message),
    urgency: calculateUrgency(message),
    urgencySource: 'rules',
    supervisorRequested: detectSupervisorRequest(message),
    source: 'fallback'
  };
}

/**
 * Parse the model's JSON reply and validate each field against the allowed values.
 *
 * Matching on the declared fields (rather than scanning prose for keywords)
 * avoids misreading replies like "this is not a billing issue".
 *
 * Exported for tests.
 *
 * @returns {{category: string, urgency: string | null, supervisorRequested: boolean | null, reasoning: string}}
 */
export function parseTriage(content) {
  const matchAllowed = (allowed, value) =>
    allowed.find((name) => name.toLowerCase() === String(value ?? '').trim().toLowerCase()) ?? null;

  // Only a real boolean (or the strings "true"/"false") counts. Anything else
  // returns null so the caller falls back to the keyword check rather than
  // treating a stray value as truthy.
  const matchBoolean = (value) => {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
  };

  try {
    const parsed = JSON.parse(content);
    const category = matchAllowed(CATEGORIES, parsed.category);
    if (category) {
      return {
        category,
        urgency: matchAllowed(URGENCY_LEVELS, parsed.urgency),
        supervisorRequested: matchBoolean(parsed.supervisorRequested),
        reasoning: typeof parsed.reasoning === 'string' && parsed.reasoning.trim()
          ? parsed.reasoning.trim()
          : 'No reasoning provided.'
      };
    }
  } catch {
    // Not valid JSON - fall through to the exact-name scan below.
  }

  // Last resort: look for an exact category name in the raw reply.
  const exactMatch = CATEGORIES.find((name) =>
    content.toLowerCase().includes(name.toLowerCase())
  );

  return {
    category: exactMatch || 'Unknown',
    urgency: null,
    supervisorRequested: null,
    reasoning: content.trim()
  };
}

/**
 * Have the model review an agent's draft reply before it goes to the customer.
 *
 * There is no rule-based fallback for this: judging whether a reply is accurate
 * and appropriately worded is not something a keyword list can do, so when the
 * API is unavailable this reports `available: false` rather than inventing a
 * verdict a supervisor might trust.
 *
 * @param {{message: string, reply: string, category?: string, urgency?: string}} input
 * @returns {Promise<{available: boolean, verdict?: string, issues?: string[], suggestedReply?: string, error?: string}>}
 */
export async function reviewAgentReply({ message, reply, category, urgency }) {
  if (!reply || !reply.trim()) {
    return { available: false, error: 'There is no draft reply to review yet.' };
  }

  try {
    const content = await callModel('review', { message, reply, category, urgency });

    return { available: true, ...parseReview(content) };
  } catch (error) {
    console.warn('Reply review failed:', error.message);
    return { available: false, error: error.message };
  }
}

/**
 * Parse and validate a review reply.
 *
 * An unrecognised verdict becomes "Needs edits": the safe direction for a
 * supervisor check is to ask for a human look, never to wave a reply through.
 *
 * Exported for tests.
 *
 * @returns {{verdict: string, issues: string[], suggestedReply: string}}
 */
export function parseReview(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return {
      verdict: 'Needs edits',
      issues: ['The review could not be read automatically, so it needs a human look.'],
      suggestedReply: ''
    };
  }

  const verdict = REVIEW_VERDICTS.find(
    (name) => name.toLowerCase() === String(parsed.verdict ?? '').trim().toLowerCase()
  ) ?? 'Needs edits';

  const issues = Array.isArray(parsed.issues)
    ? parsed.issues
        .filter((issue) => typeof issue === 'string' && issue.trim())
        .map((issue) => issue.trim())
        .slice(0, 10)
    : [];

  const suggestedReply = typeof parsed.suggestedReply === 'string'
    ? parsed.suggestedReply.trim()
    : '';

  return { verdict, issues, suggestedReply };
}

/**
 * Rule-based categorization for when the API is unavailable.
 *
 * Deterministic: the same message always yields the same category and wording.
 */
function getMockCategorization(message) {
  const lowerMessage = message.toLowerCase();

  // Array of possible reasoning variations for each category
  const reasoningVariations = {
    billing: [
      "Based on keywords related to payments and billing, this appears to be a billing-related inquiry. The customer may need assistance with account charges or payment issues.",
      "This message contains billing terminology. The customer is likely experiencing issues with payments, invoices, or account charges.",
      "The message references financial matters related to the customer's account. This suggests a billing or payment concern that requires attention.",
    ],
    technical: [
      "This message describes technical difficulties or system errors. The customer is reporting functionality issues that may require engineering review.",
      "Based on error-related keywords, this appears to be a technical support issue. The customer is experiencing problems with product functionality.",
      "The message indicates a technical problem or bug. This requires investigation from the technical support team.",
      "System-related issues are mentioned in this message. The customer needs technical assistance to resolve functionality problems.",
    ],
    feature: [
      "This message suggests improvements or new functionality. The customer is providing product feedback and feature suggestions.",
      "The customer is requesting enhancements to the product. This appears to be a feature request that should be reviewed by the product team.",
      "Based on the language used, this seems to be a suggestion for product improvements rather than a support issue.",
    ],
    inquiry: [
      "This appears to be a general question about the product or service. The customer is seeking information or clarification.",
      "The message contains questions that don't indicate a specific problem. This is likely a general inquiry requiring informational support.",
      "Based on the question format, this seems to be an information request rather than a technical or billing issue.",
    ],
    positive: [
      "This message contains positive sentiment and appreciation. While not a support request, it may warrant acknowledgment.",
      "The customer is expressing satisfaction or gratitude. This doesn't appear to require immediate support action.",
    ],
    ambiguous: [
      "The message content is unclear or doesn't match standard support categories. Manual review may be needed for proper categorization.",
      "This message doesn't contain clear indicators for automatic categorization. Human review recommended.",
    ]
  };

  // Pick a variation from a stable hash of the message so a re-analysis of the
  // same text produces the same explanation.
  const getReasoning = (category) => {
    const reasons = reasoningVariations[category];
    let hash = 0;
    for (let i = 0; i < message.length; i++) {
      hash = (hash + message.charCodeAt(i)) % 997;
    }
    return reasons[hash % reasons.length];
  };

  // Billing-related detection
  if (lowerMessage.includes('bill') || lowerMessage.includes('payment') ||
      lowerMessage.includes('charge') || lowerMessage.includes('invoice') ||
      lowerMessage.includes('credit card') || lowerMessage.includes('subscription') ||
      lowerMessage.includes('refund') ||
      (lowerMessage.includes('cancel') && lowerMessage.includes('account'))) {
    return {
      category: "Billing Issue",
      reasoning: getReasoning('billing')
    };
  }

  // Technical problem detection
  if (lowerMessage.includes('bug') || lowerMessage.includes('error') ||
      lowerMessage.includes('broken') || lowerMessage.includes('not working') ||
      lowerMessage.includes('crash') || lowerMessage.includes('down') ||
      lowerMessage.includes('server') || lowerMessage.includes('loading') ||
      lowerMessage.includes('slow') || lowerMessage.includes('issue') ||
      (lowerMessage.includes('problem') && !lowerMessage.includes('no problem'))) {
    return {
      category: "Technical Problem",
      reasoning: getReasoning('technical')
    };
  }

  // Feature request detection
  if (lowerMessage.includes('feature') || lowerMessage.includes('improve') ||
      lowerMessage.includes('would like to see') || lowerMessage.includes('suggestion') ||
      lowerMessage.includes('wish') || lowerMessage.includes('enhancement') ||
      lowerMessage.includes('would be great') ||
      (lowerMessage.includes('add') &&
        (lowerMessage.includes('please') || lowerMessage.includes('could')))) {
    return {
      category: "Feature Request",
      reasoning: getReasoning('feature')
    };
  }

  // Positive feedback detection
  if ((lowerMessage.includes('thank') || lowerMessage.includes('thanks') || lowerMessage.includes('appreciate')) &&
      !lowerMessage.includes('but') && !lowerMessage.includes('however')) {
    return {
      category: "General Inquiry",
      reasoning: getReasoning('positive')
    };
  }

  // Question/inquiry detection
  if (lowerMessage.includes('how') || lowerMessage.includes('what') ||
      lowerMessage.includes('when') || lowerMessage.includes('where') ||
      lowerMessage.includes('can i') || lowerMessage.includes('is there') ||
      lowerMessage.includes('?')) {
    return {
      category: "General Inquiry",
      reasoning: getReasoning('inquiry')
    };
  }

  // Fallback for ambiguous messages
  return {
    category: "General Inquiry",
    reasoning: getReasoning('ambiguous')
  };
}
