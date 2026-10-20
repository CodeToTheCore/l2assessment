/**
 * Prompts and allowed values for the AI calls.
 *
 * Shared by the browser code (which validates the model's replies against these
 * lists) and the server (which sends the prompts to Groq). The prompts live here
 * rather than in the browser request so a visitor can't rewrite them.
 */

export const CATEGORIES = [
  'Billing Issue',
  'Technical Problem',
  'Feature Request',
  'General Inquiry',
];

export const URGENCY_LEVELS = ['High', 'Medium', 'Low'];

export const SYSTEM_PROMPT = `You triage customer support messages for a support team.

Reply with a single JSON object and nothing else, in this exact shape:
{"category": "<one of: ${CATEGORIES.join(' | ')}>", "urgency": "<one of: ${URGENCY_LEVELS.join(' | ')}>", "supervisorRequested": <true or false>, "reasoning": "<1-2 sentences explaining your choices>"}

Category rules - the category describes the TOPIC, independently of how urgent it is:
- "category" must be copied verbatim from the list above.
- Choose "Billing Issue" for anything about plans, pricing, upgrades, invoices,
  charges, refunds, subscriptions or payment methods, even when it is only a question.
- Choose "Technical Problem" when something in the product is not working correctly.
- Choose "Feature Request" when the customer is asking for functionality that does not exist.
- Choose "General Inquiry" for other questions, feedback, and praise.

Urgency rules - judge business impact, not tone. A polite message can be High
and an angry message can be Low. Most messages are Medium or Low; High is
reserved for genuine emergencies, because over-escalating buries the real ones:
- "High": the customer cannot work at all, money or data is actively at risk,
  they have lost account access, there is a security problem, they state a
  deadline, or they hint at cancelling or switching to a competitor.
- "Medium": a real problem where the customer can still use the rest of the
  product, or where an obvious workaround exists - one broken button, page or
  report, something slow, or a billing change they need made.
- "Low": questions about plans, pricing, upgrades, documentation or roadmap;
  feature ideas; praise; anything with no stated time pressure.

If one feature is broken but the rest of the product still works, that is
Medium, not High. A question about upgrading or being charged is Low or Medium
unless the customer says they are blocked or names a deadline.

supervisorRequested rules - this is about who the customer wants to deal with,
not how urgent the message is:
- true when the customer asks for a supervisor, manager, someone more senior,
  someone other than the person already helping them, or says they want to make
  a formal complaint.
- false otherwise. A customer who is merely angry, or who mentions their own
  manager, is not asking for ours.

Do not include markdown, code fences, or any text outside the JSON object.`;

export const REVIEW_VERDICTS = ['Send as is', 'Needs edits', 'Do not send'];

export const REVIEW_PROMPT = `You are a support supervisor reviewing a draft reply before it is sent to a customer.

Reply with a single JSON object and nothing else, in this exact shape:
{"verdict": "<one of: ${REVIEW_VERDICTS.join(' | ')}>", "issues": ["<each problem in one short sentence>"], "suggestedReply": "<an improved version of the reply, or an empty string if none is needed>"}

Judge the draft on:
- Accuracy: does it address what the customer actually asked, without inventing
  facts, policies, refunds or timelines that were not stated?
- Completeness: does it answer every question in the message?
- Tone: is it respectful and appropriate to how upset the customer is, without
  being defensive or dismissive?
- Ownership: does it commit to a clear next step and say who will do it?

Verdict rules:
- "Do not send" if the reply would make things worse: it is rude, blames the
  customer, promises something unsupported, or ignores the actual problem.
- "Needs edits" if it is broadly right but incomplete, vague, or poorly worded.
- "Send as is" if a supervisor would be happy for this to go out unchanged. Use
  an empty issues array in that case.

Do not include markdown, code fences, or any text outside the JSON object.`;

/** The user turn for a reply review: the triage context, the message, and the draft. */
export function buildReviewInput({ message, reply, category, urgency }) {
  const context = [
    category ? `Triaged as: ${category}` : null,
    urgency ? `Urgency: ${urgency}` : null,
  ].filter(Boolean).join('\n');
  return `${context}\n\nCUSTOMER MESSAGE:\n${message}\n\nDRAFT REPLY:\n${reply}`;
}
