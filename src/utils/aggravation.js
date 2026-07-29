/**
 * Aggravation detection — how upset the customer is, as its own signal.
 *
 * Deliberately separate from urgency. Urgency answers "how much business impact
 * does this have"; aggravation answers "how badly is this relationship going".
 * A calm outage is High urgency and not aggravated; a furious complaint about a
 * cosmetic bug is aggravated and Low urgency. Mixing them is how the original
 * scorer ended up treating shouting as a discount.
 *
 * Rule-based and deterministic on purpose: a hard-coded phrase list with plain
 * counting, no weighted stacking. The earlier urgency scorer's worst bug came
 * from stacked weighted branches nobody could reason about.
 *
 * `signals` matters as much as the boolean — it says *why*, which makes the
 * behaviour debuggable and the tests specific.
 */

/** Phrases that on their own mean the customer is aggravated. */
const FRUSTRATION_PHRASES = [
  'ridiculous', 'unacceptable', 'outrageous', 'appalling', 'disgraceful',
  'furious', 'livid', 'fed up', 'sick of', 'done with this', 'had enough',
  'waste of time', 'wasting my time', 'terrible', 'awful', 'horrible',
  'worst', 'useless', 'incompetent', 'joke', 'shambles', 'disappointed',
  'frustrated', 'frustrating', 'not good enough', 'no excuse',
]

/** Phrases that mean they have had to chase us. */
const REPEAT_CONTACT_PHRASES = [
  'third time', 'fourth time', 'fifth time', 'again and again',
  'still waiting', 'still no reply', 'still nothing', 'no one has replied',
  'nobody has replied', 'no response', 'never heard back', 'chasing this',
  'asked twice', 'asked three times', 'multiple emails', 'several emails',
  'as i said before', 'like i said', 'i already explained', 'every time i',
]

/** Phrases that put the relationship itself at risk. */
const CHURN_PHRASES = [
  'cancel our account', 'cancel my account', 'cancel our subscription',
  'cancel my subscription', 'switching to', 'switch to a competitor',
  'moving to another', 'looking at alternatives', 'evaluating competitors',
  'take our business elsewhere', 'chargeback', 'dispute the charge',
  'speak to our lawyer', 'legal action', 'leave a review',
]

// Thresholds for the tone signals. These are reported but never sufficient on
// their own - see below.
const SHOUT_MIN_LENGTH = 12
const SHOUT_MIN_RATIO = 0.6
const PUNCTUATION_THRESHOLD = 3

function containsAny(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase))
}

/**
 * Is this message mostly written in capitals?
 *
 * Ratio-based rather than an exact `=== toUpperCase()` check, so a mostly-shouted
 * message still counts.
 */
function isShouting(message) {
  const letters = message.replace(/[^a-z]/gi, '')
  if (letters.length < SHOUT_MIN_LENGTH) return false

  const capitals = letters.replace(/[^A-Z]/g, '').length
  return capitals / letters.length >= SHOUT_MIN_RATIO
}

function hasExcessivePunctuation(message) {
  const exclamations = (message.match(/!/g) || []).length
  const questions = (message.match(/\?/g) || []).length
  return exclamations >= PUNCTUATION_THRESHOLD || questions >= PUNCTUATION_THRESHOLD
}

/**
 * Detect how aggravated a customer is.
 *
 * Tone signals (shouting, punctuation) are reported but never set `aggravated`
 * by themselves: "THANKS!!!" is emphatic, not angry, and treating punctuation as
 * anger would make the flag useless. A wording, repeat-contact or churn phrase
 * is what actually sets it.
 *
 * @param {string} message
 * @returns {{aggravated: boolean, signals: string[]}}
 */
export function detectAggravation(message) {
  if (typeof message !== 'string' || !message.trim()) {
    return { aggravated: false, signals: [] }
  }

  const text = message.toLowerCase()
  const signals = []

  if (containsAny(text, FRUSTRATION_PHRASES)) signals.push('frustrated_wording')
  if (containsAny(text, REPEAT_CONTACT_PHRASES)) signals.push('repeat_contact')
  if (containsAny(text, CHURN_PHRASES)) signals.push('threatening_to_leave')
  if (isShouting(message)) signals.push('shouting')
  if (hasExcessivePunctuation(message)) signals.push('excessive_punctuation')

  const decisive = ['frustrated_wording', 'repeat_contact', 'threatening_to_leave']
  const aggravated = signals.some((signal) => decisive.includes(signal))

  return { aggravated, signals }
}
