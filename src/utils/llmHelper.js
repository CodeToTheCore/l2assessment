import Groq from 'groq-sdk';
import { calculateUrgency } from './urgencyScorer.js';

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

// Optional chaining so this module can also be imported outside Vite (tests).
const API_KEY = import.meta.env?.VITE_GROQ_API_KEY;

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
{"category": "<one of: ${CATEGORIES.join(' | ')}>", "urgency": "<one of: ${URGENCY_LEVELS.join(' | ')}>", "reasoning": "<1-2 sentences explaining both choices>"}

Category rules:
- "category" must be copied verbatim from the list above.
- Choose "General Inquiry" when the message is a question, feedback, or does not fit the other categories.

Urgency rules - judge business impact, not tone. A polite message can be High
and an angry message can be Low:
- "High": the customer is blocked or cannot work, money or data is at risk,
  a security or account-access problem, an explicit deadline, or a hint that
  they may cancel or switch to a competitor.
- "Medium": a real problem that has a workaround or is not blocking work, and
  billing changes that are not urgent.
- "Low": questions, documentation requests, feature ideas, praise, and anything
  with no time pressure.

Do not include markdown, code fences, or any text outside the JSON object.`;

/**
 * Triage a customer support message using Groq AI.
 *
 * Asks the model for the category AND the urgency in one call: urgency depends
 * on meaning ("revenue is stopped", "our account was compromised") that keyword
 * rules cannot reliably detect. The rule-based scorer stays on as the fallback
 * for when the API is unavailable.
 *
 * `source` and `urgencySource` tell the caller which path produced the result
 * so the UI can be honest about it.
 *
 * @param {string} message - The customer support message
 * @returns {Promise<{category: string, urgency: string, reasoning: string, source: 'llm' | 'fallback', urgencySource: 'llm' | 'rules', error?: string}>}
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
 * @returns {{category: string, urgency: string | null, reasoning: string}}
 */
export function parseTriage(content) {
  const matchAllowed = (allowed, value) =>
    allowed.find((name) => name.toLowerCase() === String(value ?? '').trim().toLowerCase()) ?? null;

  try {
    const parsed = JSON.parse(content);
    const category = matchAllowed(CATEGORIES, parsed.category);
    if (category) {
      return {
        category,
        urgency: matchAllowed(URGENCY_LEVELS, parsed.urgency),
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
    reasoning: content.trim()
  };
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
