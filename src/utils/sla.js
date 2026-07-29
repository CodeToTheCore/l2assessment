/**
 * Follow-up targets — makes sure a triaged message actually gets answered.
 *
 * Every analysis gets a "respond by" time derived from its urgency. Nothing here
 * reads the clock implicitly: `now` is always a parameter, so the same inputs
 * always produce the same answer and the behaviour is testable.
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

/**
 * Response targets in milliseconds, keyed by urgency.
 *
 * These are calendar hours, not business hours. Business-hour maths would make
 * the target depend on holidays and time zones, which belongs on a server with
 * the customer's support schedule, not in the browser.
 */
export const RESPONSE_TARGETS = {
  High: 1 * HOUR,
  Medium: 24 * HOUR,
  Low: 72 * HOUR,
}

const DEFAULT_TARGET = RESPONSE_TARGETS.Medium

// A follow-up counts as "due soon" once three quarters of its window is gone.
const DUE_SOON_FRACTION = 0.25

/**
 * The response target for an urgency level.
 *
 * @param {string} urgency
 * @returns {number} milliseconds
 */
export function targetFor(urgency) {
  return RESPONSE_TARGETS[urgency] ?? DEFAULT_TARGET
}

/**
 * When an analysis should be responded to.
 *
 * Falls back to deriving the deadline from the timestamp and urgency, so records
 * saved before follow-up tracking existed still get a sensible target instead of
 * needing a migration.
 *
 * @param {object} entry - A stored analysis
 * @returns {number} epoch milliseconds, or NaN if the entry has no usable timestamp
 */
export function dueByFor(entry) {
  if (entry?.dueBy) {
    const explicit = new Date(entry.dueBy).getTime()
    if (!Number.isNaN(explicit)) return explicit
  }

  const created = new Date(entry?.timestamp).getTime()
  if (Number.isNaN(created)) return NaN

  return created + targetFor(entry?.urgency)
}

/**
 * Where an analysis stands against its response target.
 *
 * @param {object} entry - A stored analysis
 * @param {number} [now] - epoch milliseconds
 * @returns {{state: 'done' | 'overdue' | 'due-soon' | 'on-track', dueBy: number, msRemaining: number}}
 */
export function slaStatus(entry, now = Date.now()) {
  const dueBy = dueByFor(entry)
  const msRemaining = dueBy - now

  if (entry?.status === 'done') return { state: 'done', dueBy, msRemaining }
  if (Number.isNaN(dueBy)) return { state: 'on-track', dueBy, msRemaining: NaN }
  if (msRemaining <= 0) return { state: 'overdue', dueBy, msRemaining }

  const window = targetFor(entry?.urgency)
  const state = msRemaining <= window * DUE_SOON_FRACTION ? 'due-soon' : 'on-track'
  return { state, dueBy, msRemaining }
}

/**
 * Split a history into follow-up buckets, most overdue first.
 *
 * @param {Array<object>} history
 * @param {number} [now] - epoch milliseconds
 */
export function summarizeFollowUps(history, now = Date.now()) {
  const overdue = []
  const dueSoon = []
  let open = 0
  let done = 0

  for (const entry of history) {
    const { state, dueBy } = slaStatus(entry, now)
    if (state === 'done') {
      done += 1
      continue
    }
    open += 1
    if (state === 'overdue') overdue.push({ entry, dueBy })
    else if (state === 'due-soon') dueSoon.push({ entry, dueBy })
  }

  overdue.sort((a, b) => a.dueBy - b.dueBy)
  dueSoon.sort((a, b) => a.dueBy - b.dueBy)

  return {
    overdue: overdue.map((item) => item.entry),
    dueSoon: dueSoon.map((item) => item.entry),
    open,
    done,
    needsAttention: overdue.length + dueSoon.length,
  }
}

/**
 * Human-readable time remaining, e.g. "in 45m" or "2h overdue".
 *
 * @param {number} msRemaining
 * @returns {string}
 */
export function formatRemaining(msRemaining) {
  if (Number.isNaN(msRemaining)) return 'no target'

  const overdue = msRemaining < 0
  const abs = Math.abs(msRemaining)
  const minutes = Math.round(abs / MINUTE)

  let text
  if (minutes < 60) {
    text = `${Math.max(minutes, 1)}m`
  } else if (abs < 48 * HOUR) {
    text = `${Math.round(abs / HOUR)}h`
  } else {
    text = `${Math.round(abs / (24 * HOUR))}d`
  }

  return overdue ? `${text} overdue` : `in ${text}`
}
