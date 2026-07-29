import test from 'node:test'
import assert from 'node:assert/strict'
import { getRecommendedAction } from './templates.js'

test('each category gets its own advice', () => {
  // Regression: "Feature Request" used to return the billing-portal action.
  const feature = getRecommendedAction('Feature Request', 'Low')
  assert.match(feature, /backlog/)
  assert.doesNotMatch(feature, /billing portal/)

  assert.match(getRecommendedAction('Billing Issue', 'Low'), /billing portal/)
  assert.match(getRecommendedAction('Technical Problem', 'Low'), /reproduce/)
  assert.match(getRecommendedAction('General Inquiry', 'Low'), /FAQ/)
})

test('urgency changes the recommendation', () => {
  // Regression: the urgency argument used to be accepted and ignored.
  const high = getRecommendedAction('Technical Problem', 'High')
  const low = getRecommendedAction('Technical Problem', 'Low')
  assert.notEqual(high, low)
  assert.match(high, /Escalate/)
  assert.match(low, /normal queue/)
})

test('high urgency escalates, and nothing below High does', () => {
  for (const category of ['Billing Issue', 'Technical Problem', 'Feature Request', 'General Inquiry']) {
    assert.match(getRecommendedAction(category, 'High'), /Escalate/, `${category} High`)
    // Regression: Medium billing used to escalate, which paged a senior agent
    // for routine requests like changing the card on file.
    assert.doesNotMatch(getRecommendedAction(category, 'Medium'), /Escalate/, `${category} Medium`)
    assert.doesNotMatch(getRecommendedAction(category, 'Low'), /Escalate/, `${category} Low`)
  }
})

test('unknown categories fall back to manual review', () => {
  assert.match(getRecommendedAction('Unknown', 'Medium'), /Review manually/)
  assert.match(getRecommendedAction('Something New', 'Medium'), /Review manually/)
  assert.match(getRecommendedAction(undefined, 'Medium'), /Review manually/)
})

test('a missing urgency still returns usable advice', () => {
  const action = getRecommendedAction('Billing Issue')
  assert.match(action, /billing portal/)
  assert.ok(action.length > 0)
})

test('a supervisor request escalates at any urgency', () => {
  // A calm, low-impact message that asks for a manager still needs a manager.
  for (const urgency of ['High', 'Medium', 'Low']) {
    const action = getRecommendedAction('General Inquiry', urgency, true)
    assert.match(action, /supervisor/i, `${urgency} with supervisor request`)
  }
})

test('the supervisor line asks for the reply to be reviewed', () => {
  const action = getRecommendedAction('Billing Issue', 'Low', true)
  assert.match(action, /reviewed before sending/)
  // Still carries the category advice.
  assert.match(action, /billing portal/)
})

test('no supervisor request leaves the urgency guidance untouched', () => {
  assert.equal(
    getRecommendedAction('Billing Issue', 'Low', false),
    getRecommendedAction('Billing Issue', 'Low')
  )
  assert.doesNotMatch(getRecommendedAction('Billing Issue', 'Low', false), /supervisor/i)
})

test('only a real true escalates, not any truthy value', () => {
  assert.doesNotMatch(getRecommendedAction('Billing Issue', 'Low', 'maybe'), /supervisor/i)
  assert.doesNotMatch(getRecommendedAction('Billing Issue', 'Low', null), /supervisor/i)
})
