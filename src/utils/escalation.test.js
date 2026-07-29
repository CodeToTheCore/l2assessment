import test from 'node:test'
import assert from 'node:assert/strict'
import { decideEscalation, ESCALATION_REASONS, REASON_LABELS } from './escalation.js'

test('an explicit supervisor request wins at every urgency', () => {
  for (const urgency of ['High', 'Medium', 'Low', undefined]) {
    const result = decideEscalation({ urgency, customerRequestedSupervisor: true })
    assert.equal(result.escalate, true, `urgency ${urgency}`)
    assert.equal(result.reason, 'customer_requested', `urgency ${urgency}`)
  }
})

test('high urgency escalates on its own', () => {
  const result = decideEscalation({ urgency: 'High' })
  assert.equal(result.escalate, true)
  assert.equal(result.reason, 'high_urgency')
})

test('high urgency plus aggravation reports the combined reason', () => {
  const result = decideEscalation({ urgency: 'High', aggravated: true })
  assert.equal(result.escalate, true)
  assert.equal(result.reason, 'high_urgency_and_aggravated')
})

test('aggravation alone does not escalate', () => {
  // Being upset is not the same as being blocked. Letting tone drive routing is
  // the original scorer's mistake in reverse.
  for (const urgency of ['Medium', 'Low']) {
    const result = decideEscalation({ urgency, aggravated: true })
    assert.equal(result.escalate, false, `urgency ${urgency}`)
    assert.equal(result.reason, 'none', `urgency ${urgency}`)
    // ...but it is still reported so the agent sees it.
    assert.equal(result.aggravated, true, `urgency ${urgency}`)
  }
})

test('a calm low-impact message does not escalate', () => {
  const result = decideEscalation({ category: 'Feature Request', urgency: 'Low' })
  assert.deepEqual(result, { escalate: false, reason: 'none', aggravated: false })
})

test('a supervisor request outranks the aggravated combination', () => {
  const result = decideEscalation({
    urgency: 'High',
    aggravated: true,
    customerRequestedSupervisor: true
  })
  assert.equal(result.reason, 'customer_requested')
})

test('category does not affect the decision', () => {
  // Regression: escalating every Medium billing message paged a senior agent for
  // routine work like changing the card on file.
  for (const category of ['Billing Issue', 'Technical Problem', 'Feature Request', 'General Inquiry']) {
    assert.equal(decideEscalation({ category, urgency: 'Medium' }).escalate, false, category)
  }
})

test('only a real true counts for either flag', () => {
  assert.equal(decideEscalation({ urgency: 'Low', customerRequestedSupervisor: 'yes' }).escalate, false)
  assert.equal(decideEscalation({ urgency: 'Low', aggravated: 'very' }).aggravated, false)
})

test('an unknown urgency does not escalate', () => {
  assert.equal(decideEscalation({ urgency: 'Critical' }).escalate, false)
  assert.equal(decideEscalation({ urgency: 'high' }).escalate, false)
})

test('missing and null input are handled without throwing', () => {
  assert.deepEqual(decideEscalation(), { escalate: false, reason: 'none', aggravated: false })
  assert.deepEqual(decideEscalation(null), { escalate: false, reason: 'none', aggravated: false })
})

test('every returned reason is in the allow-list and has a label', () => {
  const inputs = [
    { customerRequestedSupervisor: true },
    { urgency: 'High' },
    { urgency: 'High', aggravated: true },
    { urgency: 'Low' },
  ]
  for (const input of inputs) {
    const { reason } = decideEscalation(input)
    assert.ok(ESCALATION_REASONS.includes(reason), `${reason} not allow-listed`)
    assert.ok(REASON_LABELS[reason], `${reason} has no label`)
  }
})
