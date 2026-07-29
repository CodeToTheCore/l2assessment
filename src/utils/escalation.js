/**
 * Escalation decision — the layer that consumes classification output.
 *
 * Pure and total: takes only the already-computed signals, never the raw message
 * and never the LLM. Same shape as the recommendation templates, which also
 * consume category and urgency rather than re-deriving them. That keeps
 * classification, tone and routing independently testable.
 */

/**
 * Allow-listed reasons, in precedence order. An enum rather than free text for
 * the same reason categories are allow-listed: it can be stored, counted and
 * asserted on, and it cannot drift into prose.
 */
export const ESCALATION_REASONS = [
  'customer_requested',
  'high_urgency_and_aggravated',
  'high_urgency',
  'none',
]

/** Wording for each reason, for the UI and the stored audit trail. */
export const REASON_LABELS = {
  customer_requested: 'The customer asked for a supervisor',
  high_urgency_and_aggravated: 'High urgency, and the customer is upset',
  high_urgency: 'High urgency',
  none: 'No escalation needed',
}

/**
 * Decide whether a triaged message should go to a supervisor.
 *
 * Precedence is deliberate:
 * 1. An explicit request always wins, at any urgency. A calm, low-impact message
 *    asking for a manager still needs a manager.
 * 2. High urgency escalates on its own. Aggravation only sharpens the reason, so
 *    a High-urgency outage from a polite customer is not deprioritised.
 * 3. Aggravation alone does NOT escalate. Being upset is not the same as being
 *    blocked, and letting tone drive routing is the mistake the original urgency
 *    scorer made in reverse. It is still surfaced to the agent as a signal.
 *
 * `category` is accepted as part of the input shape but does not affect the
 * decision. An earlier version escalated every Medium billing message on the
 * theory that billing is revenue-impacting; live testing showed that paged a
 * senior agent for routine work like changing the card on file.
 *
 * @param {{category?: string, urgency?: string, aggravated?: boolean, customerRequestedSupervisor?: boolean}} input
 * @returns {{escalate: boolean, reason: string, aggravated: boolean}}
 */
export function decideEscalation(input) {
  // Tolerate null as well as a missing argument.
  const { urgency, aggravated = false, customerRequestedSupervisor = false } = input ?? {}

  const isAggravated = aggravated === true
  const isHigh = urgency === 'High'

  if (customerRequestedSupervisor === true) {
    return { escalate: true, reason: 'customer_requested', aggravated: isAggravated }
  }

  if (isHigh && isAggravated) {
    return { escalate: true, reason: 'high_urgency_and_aggravated', aggravated: isAggravated }
  }

  if (isHigh) {
    return { escalate: true, reason: 'high_urgency', aggravated: isAggravated }
  }

  return { escalate: false, reason: 'none', aggravated: isAggravated }
}
