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

test('high urgency always escalates, and billing escalates at medium', () => {
  for (const category of ['Billing Issue', 'Technical Problem', 'Feature Request', 'General Inquiry']) {
    assert.match(getRecommendedAction(category, 'High'), /Escalate/, `${category} High`)
  }
  assert.match(getRecommendedAction('Billing Issue', 'Medium'), /Escalate/)
  assert.doesNotMatch(getRecommendedAction('Feature Request', 'Medium'), /Escalate/)
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
