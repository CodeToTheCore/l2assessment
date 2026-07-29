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

/**
 * Determines if a message should be escalated to a senior agent.
 *
 * @param {string} category - The message category
 * @param {string} urgency - The urgency level
 * @returns {boolean} - Whether to escalate
 */
function shouldEscalate(category, urgency) {
  if (urgency === 'High') return true
  // Billing problems have direct revenue impact, so escalate sooner.
  return category === 'Billing Issue' && urgency === 'Medium'
}

/**
 * Get recommended action for a given category and urgency.
 *
 * @param {string} category - The message category
 * @param {string} [urgency] - The urgency level ("High" | "Medium" | "Low")
 * @returns {string} - Recommended next step
 */
export function getRecommendedAction(category, urgency) {
  const action = actionTemplates[category] || actionTemplates.Unknown
  const guidance = shouldEscalate(category, urgency)
    ? urgencyGuidance.High
    : urgencyGuidance[urgency]

  return guidance ? `${guidance} ${action}` : action
}
