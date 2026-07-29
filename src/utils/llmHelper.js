import Groq from 'groq-sdk';
import { calculateUrgency } from './urgencyScorer.js';
import { detectSupervisorRequest } from './supervisor.js';

/**
 * LLM Helper for triaging customer support messages
 * Using Groq API for AI-powered categorization and urgency scoring
 */

export const CATEGORIES = [
  'Billing Issue',
  'Technical Problem',
  'Feature Request',
  'General Inquiry',
];

export const URGENCY_LEVELS = ['High', 'Medium', 'Low'];

// Vite injects import.meta.env in the browser build. The process.env fallback lets
// this module also run under plain Node, so the triage logic can be exercised by
// tests and offline evaluation scripts without duplicating it.
const API_KEY =
  import.meta.env?.VITE_GROQ_API_KEY ?? globalThis.process?.env?.VITE_GROQ_API_KEY;

// Only construct the client when a key is configured; otherwise we go straight
// to the rule-based fallback instead of making a request that must fail.
const groq = API_KEY
  ? new Groq({
      apiKey: API_KEY,
      dangerouslyAllowBrowser: true // Required for browser-based calls (not recommended for production!)
    })
  : null;

const SYSTEM_PROMPT = `You triage customer support messages for a support team.

Reply with a single JSON object and nothing else, in this exact shape:
{"category": "<one of: ${CATEGORIES.join(' | ')}>", "urgency": "<one of: ${URGENCY_LEVELS.join(' | ')}>", "supervisorRequested": <true or false>, "reasoning": "<1-2 sentences explaining your choices>"}

Category rules - the category describes the TOPIC, independently of how urgent it is:
- "category" must be copied verbatim from the list above.
- Choose "Billing Issue" for anything about plans, pricing, upgrades, invoices,
  charges, refunds, subscriptions or payment methods, even when it is only a question.
- Choose "Technical Problem" when something in the product is not working correctly.
- Choose "Feature Request" when the customer is asking for functionality that does not exist.
- Choose "General Inquiry" for other questions, feedback, and praise.

Urgency rules - judge business impact, not tone. A polite message can be High
and an angry message can be Low. Most messages are Medium or Low; High is
reserved for genuine emergencies, because over-escalating buries the real ones:
- "High": the customer cannot work at all, money or data is actively at risk,
  they have lost account access, there is a security problem, they state a
  deadline, or they hint at cancelling or switching to a competitor.
- "Medium": a real problem where the customer can still use the rest of the
  product, or where an obvious workaround exists - one broken button, page or
  report, something slow, or a billing change they need made.
- "Low": questions about plans, pricing, upgrades, documentation or roadmap;
  feature ideas; praise; anything with no stated time pressure.

If one feature is broken but the rest of the product still works, that is
Medium, not High. A question about upgrading or being charged is Low or Medium
unless the customer says they are blocked or names a deadline.

supervisorRequested rules - this is about who the customer wants to deal with,
not how urgent the message is:
- true when the customer asks for a supervisor, manager, someone more senior,
  someone other than the person already helping them, or says they want to make
  a formal complaint.
- false otherwise. A customer who is merely angry, or who mentions their own
  manager, is not asking for ours.

Do not include markdown, code fences, or any text outside the JSON object.`;

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
  if (!groq) {
    return {
      ...getFallbackTriage(message),
      error: 'VITE_GROQ_API_KEY is not set.'
    };
  }

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message }
      ],
      // Classification should be repeatable, so no sampling randomness.
      temperature: 0,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from Groq');

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

export const REVIEW_VERDICTS = ['Send as is', 'Needs edits', 'Do not send'];

const REVIEW_PROMPT = `You are a support supervisor reviewing a draft reply before it is sent to a customer.

Reply with a single JSON object and nothing else, in this exact shape:
{"verdict": "<one of: ${REVIEW_VERDICTS.join(' | ')}>", "issues": ["<each problem in one short sentence>"], "suggestedReply": "<an improved version of the reply, or an empty string if none is needed>"}

Judge the draft on:
- Accuracy: does it address what the customer actually asked, without inventing
  facts, policies, refunds or timelines that were not stated?
- Completeness: does it answer every question in the message?
- Tone: is it respectful and appropriate to how upset the customer is, without
  being defensive or dismissive?
- Ownership: does it commit to a clear next step and say who will do it?

Verdict rules:
- "Do not send" if the reply would make things worse: it is rude, blames the
  customer, promises something unsupported, or ignores the actual problem.
- "Needs edits" if it is broadly right but incomplete, vague, or poorly worded.
- "Send as is" if a supervisor would be happy for this to go out unchanged. Use
  an empty issues array in that case.

Do not include markdown, code fences, or any text outside the JSON object.`;

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

  if (!groq) {
    return {
      available: false,
      error: 'Reply review needs the AI service, and VITE_GROQ_API_KEY is not set.'
    };
  }

  const context = [
    category ? `Triaged as: ${category}` : null,
    urgency ? `Urgency: ${urgency}` : null,
  ].filter(Boolean).join('\n');

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: REVIEW_PROMPT },
        {
          role: "user",
          content: `${context}\n\nCUSTOMER MESSAGE:\n${message}\n\nDRAFT REPLY:\n${reply}`
        }
      ],
      temperature: 0,
      max_tokens: 700,
      response_format: { type: 'json_object' },
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from Groq');

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
