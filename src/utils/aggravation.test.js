import test from 'node:test'
import assert from 'node:assert/strict'
import { detectAggravation } from './aggravation.js'

test('frustrated wording sets the flag and names the signal', () => {
  const result = detectAggravation('This is ridiculous, your support is useless')
  assert.equal(result.aggravated, true)
  assert.ok(result.signals.includes('frustrated_wording'))
})

test('having to chase us is its own signal', () => {
  const result = detectAggravation('This is the third time I have asked. Still waiting for a reply.')
  assert.equal(result.aggravated, true)
  assert.ok(result.signals.includes('repeat_contact'))
})

test('a churn threat is its own signal', () => {
  const result = detectAggravation('If this is not fixed we are switching to a competitor')
  assert.equal(result.aggravated, true)
  assert.ok(result.signals.includes('threatening_to_leave'))
})

test('tone signals are reported but never sufficient on their own', () => {
  // "THANKS!!!" is emphatic, not angry. If punctuation or capitals set the flag,
  // the flag stops meaning anything.
  const thanks = detectAggravation('THANKS SO MUCH!!!')
  assert.deepEqual(thanks.signals.sort(), ['excessive_punctuation', 'shouting'])
  assert.equal(thanks.aggravated, false)
})

test('shouting alongside frustration reports both', () => {
  const result = detectAggravation('THIS IS COMPLETELY UNACCEPTABLE AND I AM FURIOUS')
  assert.equal(result.aggravated, true)
  assert.ok(result.signals.includes('frustrated_wording'))
  assert.ok(result.signals.includes('shouting'))
})

test('a calm factual outage report is not aggravated', () => {
  // The important negative: this is High urgency but the relationship is fine.
  const result = detectAggravation('Our production server is down and we cannot process orders')
  assert.equal(result.aggravated, false)
  assert.deepEqual(result.signals, [])
})

test('a polite request is not aggravated', () => {
  const result = detectAggravation('Hi, could you please help me update my payment method? Thank you!')
  assert.equal(result.aggravated, false)
})

test('shouting is ratio-based, not all-or-nothing', () => {
  assert.ok(detectAggravation('THE SITE IS DOWN again').signals.includes('shouting'))
  // A single shouted word in a normal sentence is not shouting.
  assert.ok(!detectAggravation('The site is DOWN and I need help with it').signals.includes('shouting'))
  // Short strings do not qualify at all.
  assert.ok(!detectAggravation('OK?').signals.includes('shouting'))
})

test('punctuation threshold needs real repetition', () => {
  assert.ok(!detectAggravation('Is this broken?').signals.includes('excessive_punctuation'))
  assert.ok(!detectAggravation('Please fix this!').signals.includes('excessive_punctuation'))
  assert.ok(detectAggravation('Please fix this!!!').signals.includes('excessive_punctuation'))
  assert.ok(detectAggravation('What? Why? How???').signals.includes('excessive_punctuation'))
})

test('signals are reported without duplicates', () => {
  const result = detectAggravation('Ridiculous, terrible, useless and awful service')
  assert.deepEqual(result.signals, ['frustrated_wording'])
})

test('empty and non-string input is safe', () => {
  for (const input of ['', '   ', undefined, null, 42, {}]) {
    const result = detectAggravation(input)
    assert.equal(result.aggravated, false)
    assert.deepEqual(result.signals, [])
  }
})
