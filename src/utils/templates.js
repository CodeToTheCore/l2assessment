/**
 * Recommendation Templates - Maps categories to recommended actions
 */

const actionTemplates = {
  "Billing Issue": "Verify the charge in the billing portal, then confirm the customer's payment method and invoice history.",
  "Technical Problem": "Try to reproduce the issue, then collect browser/OS details and any error messages before handing to engineering.",
  "General Inquiry": "Reply with the relevant FAQ article and offer a follow-up if the answer doesn't cover their case.",
  "Feature Request": "Log the request in the product backlog and let the customer know it was recorded.",
  "Unknown": "Review manually and route to the appropriate queue."
}

const urgencyGuidance = {
  High: "Escalate to a senior agent and respond within 1 hour.",
  Medium: "Respond within one business day.",
  Low: "Handle in the normal queue."
}

const SUPERVISOR_GUIDANCE =
  "The customer asked for a supervisor - hand this to one and have the reply reviewed before sending."

/**
 * Determines if a message should be escalated to a senior agent.
 *
 * Urgency carries the impact judgment, so it is the trigger for time-based
 * escalation. An earlier version also escalated every Medium billing message,
 * which paged a senior agent for routine work like "I need to change the card on
 * file before the next renewal".
 *
 * A supervisor request escalates on its own, whatever the urgency: a calm,
 * low-impact message that asks for a manager still needs a manager.
 *
 * @param {string} urgency - The urgency level
 * @param {boolean} [supervisorRequested] - Whether the customer asked for a supervisor
 * @returns {boolean} - Whether to escalate
 */
function shouldEscalate(urgency, supervisorRequested) {
  return urgency === 'High' || supervisorRequested === true
}

/**
 * Get recommended action for a given category, urgency and supervisor request.
 *
 * @param {string} category - The message category
 * @param {string} [urgency] - The urgency level ("High" | "Medium" | "Low")
 * @param {boolean} [supervisorRequested] - Whether the customer asked for a supervisor
 * @returns {string} - Recommended next step
 */
export function getRecommendedAction(category, urgency, supervisorRequested = false) {
  const action = actionTemplates[category] || actionTemplates.Unknown

  if (supervisorRequested === true) {
    return `${SUPERVISOR_GUIDANCE} ${action}`
  }

  const guidance = shouldEscalate(urgency, supervisorRequested)
    ? urgencyGuidance.High
    : urgencyGuidance[urgency]

  return guidance ? `${guidance} ${action}` : action
}
