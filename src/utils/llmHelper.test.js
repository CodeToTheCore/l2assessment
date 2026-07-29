import test from 'node:test'
import assert from 'node:assert/strict'
import { parseTriage, parseReview } from './llmHelper.js'

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

test('reads the supervisor flag as a real boolean', () => {
  const yes = parseTriage(JSON.stringify({
    category: 'General Inquiry', urgency: 'Low', supervisorRequested: true, reasoning: 'x'
  }))
  assert.equal(yes.supervisorRequested, true)

  const no = parseTriage(JSON.stringify({
    category: 'General Inquiry', urgency: 'Low', supervisorRequested: false, reasoning: 'x'
  }))
  assert.equal(no.supervisorRequested, false)
})

test('a missing or junk supervisor flag becomes null, not a truthy value', () => {
  // null tells triageMessage to fall back to the keyword check. If a stray
  // string like "no" were treated as truthy, every message would look like a
  // supervisor request.
  const missing = parseTriage(JSON.stringify({ category: 'General Inquiry', urgency: 'Low' }))
  assert.equal(missing.supervisorRequested, null)

  const junk = parseTriage(JSON.stringify({
    category: 'General Inquiry', urgency: 'Low', supervisorRequested: 'no'
  }))
  assert.equal(junk.supervisorRequested, null)
})

test('the string forms of the boolean are accepted', () => {
  const asString = parseTriage(JSON.stringify({
    category: 'General Inquiry', urgency: 'Low', supervisorRequested: 'true'
  }))
  assert.equal(asString.supervisorRequested, true)
})

test('parseReview reads a well-formed review', () => {
  const result = parseReview(JSON.stringify({
    verdict: 'Needs edits',
    issues: ['Does not answer the refund question.', 'Tone is too curt.'],
    suggestedReply: 'Hi, sorry about that...'
  }))
  assert.equal(result.verdict, 'Needs edits')
  assert.equal(result.issues.length, 2)
  assert.match(result.suggestedReply, /sorry about that/)
})

test('an unrecognised verdict fails safe to Needs edits', () => {
  // A supervisor check must never wave a reply through because a value was
  // unexpected - the safe direction is always "a human should look".
  assert.equal(parseReview(JSON.stringify({ verdict: 'Approved' })).verdict, 'Needs edits')
  assert.equal(parseReview(JSON.stringify({ verdict: '' })).verdict, 'Needs edits')
  assert.equal(parseReview(JSON.stringify({})).verdict, 'Needs edits')
})

test('an unreadable review fails safe with an explanation', () => {
  const result = parseReview('the reply looks fine to me')
  assert.equal(result.verdict, 'Needs edits')
  assert.equal(result.issues.length, 1)
  assert.match(result.issues[0], /human/)
})

test('verdict matching is case and whitespace tolerant', () => {
  assert.equal(parseReview(JSON.stringify({ verdict: ' send as is ' })).verdict, 'Send as is')
  assert.equal(parseReview(JSON.stringify({ verdict: 'DO NOT SEND' })).verdict, 'Do not send')
})

test('malformed issues lists are cleaned up rather than rendered raw', () => {
  const result = parseReview(JSON.stringify({
    verdict: 'Send as is',
    issues: ['  real issue  ', '', null, 42, { nested: true }]
  }))
  assert.deepEqual(result.issues, ['real issue'])
})

test('a non-array issues field yields an empty list', () => {
  const result = parseReview(JSON.stringify({ verdict: 'Send as is', issues: 'none' }))
  assert.deepEqual(result.issues, [])
})

test('a missing suggested rewrite is an empty string, never undefined', () => {
  const result = parseReview(JSON.stringify({ verdict: 'Send as is', issues: [] }))
  assert.equal(result.suggestedReply, '')
})
