import Groq from 'groq-sdk';
import { SYSTEM_PROMPT, REVIEW_PROMPT, buildReviewInput } from '../src/utils/prompts.js';

/**
 * Server side of every AI call. The Groq key only ever exists here.
 *
 * The browser sends just the data (a message, or a message plus a draft reply).
 * The prompts are added on the server, so a visitor can't swap in their own
 * instructions and use this endpoint as a free general-purpose chatbot.
 */

const MODEL = 'llama-3.3-70b-versatile';
export const MAX_TEXT_LENGTH = 4000;

const tooLong = (value) => typeof value === 'string' && value.length > MAX_TEXT_LENGTH;

/**
 * @param {object} body - {mode: 'triage', message} or {mode: 'review', message, reply, category?, urgency?}
 * @param {{apiKey?: string, client?: object}} options - client can be injected for tests
 * @returns {Promise<{status: number, body: object}>}
 */
export async function handleLlmRequest(body, { apiKey, client } = {}) {
  const { mode, message, reply, category, urgency } = body || {};

  if (mode !== 'triage' && mode !== 'review') {
    return { status: 400, body: { error: 'mode must be "triage" or "review".' } };
  }
  if (typeof message !== 'string' || !message.trim()) {
    return { status: 400, body: { error: 'message is required.' } };
  }
  if (mode === 'review' && (typeof reply !== 'string' || !reply.trim())) {
    return { status: 400, body: { error: 'reply is required for a review.' } };
  }
  if ([message, reply, category, urgency].some(tooLong)) {
    return { status: 413, body: { error: `Text is limited to ${MAX_TEXT_LENGTH} characters.` } };
  }

  const groq = client || (apiKey ? new Groq({ apiKey }) : null);
  if (!groq) {
    return { status: 503, body: { error: 'GROQ_API_KEY is not set on the server.' } };
  }

  const messages = mode === 'triage'
    ? [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: message }]
    : [{ role: 'system', content: REVIEW_PROMPT }, { role: 'user', content: buildReviewInput({ message, reply, category, urgency }) }];

  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages,
      // Classification and review should be repeatable, so no sampling randomness.
      temperature: 0,
      max_tokens: mode === 'triage' ? 300 : 700,
      response_format: { type: 'json_object' },
    });
    const content = response.choices?.[0]?.message?.content;
    if (!content) return { status: 502, body: { error: 'Empty response from Groq' } };
    return { status: 200, body: { content } };
  } catch (error) {
    return { status: 502, body: { error: `Groq request failed: ${error.message}` } };
  }
}
