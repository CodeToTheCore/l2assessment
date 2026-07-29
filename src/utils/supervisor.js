/**
 * Supervisor-request detection (rule-based fallback).
 *
 * The LLM reports this directly as part of triage; this keyword check is the
 * fallback for when the API is unavailable, and a safety net for when the model
 * omits the field. It is deliberately literal: a customer asking for a manager
 * says so in fairly predictable words, and a false positive here only means a
 * message gets reviewed by a human who did not strictly need to review it.
 */

const SUPERVISOR_PHRASES = [
  'supervisor',
  'manager',
  'someone in charge',
  'person in charge',
  'someone else',
  'escalate this',
  'escalate my',
  'speak to a human',
  'talk to a human',
  'higher up',
  'your boss',
  'team lead',
  'account executive',
  'complaint',
  'formal complaint',
]

/**
 * Phrases that mention a manager without asking for one.
 *
 * Matched on word boundaries, not as plain substrings: "our manager" appears
 * inside "your manager", so a substring check here would suppress the very
 * request we are looking for.
 */
const NEGATIVE_CONTEXTS = [
  'i am the manager',
  "i'm the manager",
  'i am a manager',
  "i'm a manager",
  'our manager',
  'my manager',
  'as a manager',
  'account manager said',
  'project manager',
  'password manager',
].map((phrase) => new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'))

/**
 * Does this message ask to be handled by a supervisor?
 *
 * @param {string} message
 * @returns {boolean}
 */
export function detectSupervisorRequest(message) {
  if (typeof message !== 'string' || !message.trim()) return false

  const text = message.toLowerCase()

  // "my manager asked me to follow up" is not a request for our supervisor.
  if (NEGATIVE_CONTEXTS.some((pattern) => pattern.test(text))) return false

  return SUPERVISOR_PHRASES.some((phrase) => text.includes(phrase))
}
