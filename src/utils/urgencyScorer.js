/**
 * Urgency Scorer - Rule-based urgency calculation
 *
 * Scores a message 0-100 from signals in the text itself. The result is
 * deterministic: the same message always produces the same urgency, so stored
 * history stays reproducible.
 */

// Signals that a customer is blocked or losing money right now. Any single one
// of these is enough on its own to reach High.
const CRITICAL_SIGNALS = [
  'outage', 'is down', 'are down', 'went down', 'downtime',
  'data loss', 'lost data', 'breach', 'hacked', 'fraud',
  'cannot access', "can't access", 'cant access', 'locked out', 'no access',
  'longer access', 'lost access', 'access denied', 'denied access',
  'double charged', 'charged twice', 'overcharged',
]

// Explicit urgency language and hard failures.
const HIGH_SIGNALS = [
  'urgent', 'urgently', 'asap', 'immediately', 'emergency', 'critical',
  'broken', 'not working', "doesn't work", 'does not work', 'failed',
  'failing', 'crash', 'blocked', 'blocker', 'escalate', 'unacceptable',
  'deadline', 'right now', 'losing customers', 'losing money',
  'production', 'security',
]

// Real problems that are not emergencies.
const MEDIUM_SIGNALS = [
  'error', 'bug', 'issue', 'problem', 'slow', 'refund',
  'cancel', 'invoice', 'billing', 'payment', 'charge', 'confused',
  'unable', 'stuck', 'wrong',
  'timeout', 'timing out', 'timed out',
  "won't load", 'wont load', 'will not load', 'loading forever', 'keeps loading',
]

const BASE_SCORE = 30
const HIGH_THRESHOLD = 70
const MEDIUM_THRESHOLD = 35

/** Count how many distinct phrases from `signals` appear in `text`. */
function countSignals(text, signals) {
  return signals.filter((signal) => text.includes(signal)).length
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Compute the raw 0-100 urgency score for a message.
 *
 * @param {string} message
 * @returns {number}
 */
function scoreUrgency(message) {
  const text = message.toLowerCase()
  let score = BASE_SCORE

  // Content signals, each group capped so one repetitive message can't dominate.
  const criticalHits = countSignals(text, CRITICAL_SIGNALS)
  const highHits = countSignals(text, HIGH_SIGNALS)
  const mediumHits = countSignals(text, MEDIUM_SIGNALS)

  score += Math.min(criticalHits * 40, 60)
  score += Math.min(highHits * 15, 45)
  score += Math.min(mediumHits * 10, 30)

  // No tone terms here on purpose. Urgency measures business impact only;
  // shouting, exclamation marks, politeness and gratitude are handled by
  // detectAggravation, which feeds escalation separately. Scoring tone in both
  // places would double-count it, and scoring it here is what made the original
  // version treat a shouted outage as calmer than a polite question.
  return clamp(score, 0, 100)
}

/**
 * Classify a message's urgency.
 *
 * @param {string} message - The customer support message
 * @returns {"High" | "Medium" | "Low"}
 */
export function calculateUrgency(message) {
  if (!message || !message.trim()) return 'Low'

  const score = scoreUrgency(message)
  if (score >= HIGH_THRESHOLD) return 'High'
  if (score >= MEDIUM_THRESHOLD) return 'Medium'
  return 'Low'
}
