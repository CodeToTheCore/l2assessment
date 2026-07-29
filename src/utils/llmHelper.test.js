import test from 'node:test'
import assert from 'node:assert/strict'
import { parseTriage } from './llmHelper.js'

test('reads the declared fields from a well-formed reply', () => {
  const result = parseTriage(JSON.stringify({
    category: 'Technical Problem',
    urgency: 'High',
    reasoning: 'The customer cannot check out, which blocks revenue.'
  }))
  assert.equal(result.category, 'Technical Problem')
  assert.equal(result.urgency, 'High')
  assert.match(result.reasoning, /blocks revenue/)
})

test('does not mistake a negated mention for the category', () => {
  // Regression: the original code scanned the prose for "billing" first, so a
  // reply like this was classified as a Billing Issue.
  const result = parseTriage(JSON.stringify({
    category: 'Technical Problem',
    urgency: 'Medium',
    reasoning: 'This is not a billing issue, it is a bug in the export feature.'
  }))
  assert.equal(result.category, 'Technical Problem')
})

test('rejects categories and urgencies outside the allowed values', () => {
  const result = parseTriage(JSON.stringify({
    category: 'Refund Request',
    urgency: 'Critical',
    reasoning: 'Made-up values.'
  }))
  // Unrecognised category means we do not guess; the caller shows manual review.
  assert.equal(result.category, 'Unknown')
  // Null urgency signals the caller to fall back to the rule-based scorer.
  assert.equal(result.urgency, null)
})

test('a valid category with a bad urgency keeps the category', () => {
  const result = parseTriage(JSON.stringify({
    category: 'Billing Issue',
    urgency: 'kind of urgent',
    reasoning: 'Duplicate charge.'
  }))
  assert.equal(result.category, 'Billing Issue')
  assert.equal(result.urgency, null)
})

test('field matching is case and whitespace tolerant', () => {
  const result = parseTriage(JSON.stringify({
    category: '  billing issue ',
    urgency: 'high',
    reasoning: 'Duplicate charge.'
  }))
  assert.equal(result.category, 'Billing Issue')
  assert.equal(result.urgency, 'High')
})

test('non-JSON replies do not throw', () => {
  const result = parseTriage('This looks like a Feature Request to me.')
  assert.equal(result.category, 'Feature Request')
  assert.equal(result.urgency, null)
  assert.match(result.reasoning, /Feature Request/)
})

test('unparseable replies with no category yield Unknown', () => {
  const result = parseTriage('I am not sure what to make of this message.')
  assert.equal(result.category, 'Unknown')
  assert.equal(result.urgency, null)
})

test('missing reasoning is replaced with a placeholder', () => {
  const result = parseTriage(JSON.stringify({ category: 'General Inquiry', urgency: 'Low' }))
  assert.equal(result.reasoning, 'No reasoning provided.')
})
