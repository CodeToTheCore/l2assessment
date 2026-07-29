/**
 * Recommendation Templates - Maps categories to recommended actions
 */

import { decideEscalation } from './escalation.js'

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

// Wording per escalation reason, so the advice explains *why* it is escalating.
const escalationGuidance = {
  customer_requested:
    "The customer asked for a supervisor - hand this to one and have the reply reviewed before sending.",
  high_urgency_and_aggravated:
    "Escalate to a senior agent and respond within 1 hour. The customer is already upset, so acknowledge that first.",
  high_urgency: urgencyGuidance.High,
}

/**
 * Get recommended action for a triaged message.
 *
 * Consumes the escalation decision rather than re-deriving it, so routing logic
 * lives in one place ([escalation.js](escalation.js)) and this module stays
 * responsible only for wording.
 *
 * @param {string} category - The message category
 * @param {string} [urgency] - The urgency level ("High" | "Medium" | "Low")
 * @param {{supervisorRequested?: boolean, aggravated?: boolean}} [signals]
 * @returns {string} - Recommended next step
 */
export function getRecommendedAction(category, urgency, signals) {
  const action = actionTemplates[category] || actionTemplates.Unknown
  // Tolerate null as well as a missing argument.
  const given = signals ?? {}

  const { reason } = decideEscalation({
    category,
    urgency,
    aggravated: given.aggravated,
    customerRequestedSupervisor: given.supervisorRequested,
  })

  const guidance = escalationGuidance[reason] ?? urgencyGuidance[urgency]

  return guidance ? `${guidance} ${action}` : action
}
