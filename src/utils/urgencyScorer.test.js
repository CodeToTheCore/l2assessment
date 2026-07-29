import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateUrgency } from './urgencyScorer.js'

test('blocked or revenue-impacting messages score High', () => {
  assert.equal(calculateUrgency('Our production server is down'), 'High')
  assert.equal(calculateUrgency('We cannot access our account and our whole team is blocked'), 'High')
  assert.equal(calculateUrgency('We were charged twice this month. Please refund the duplicate.'), 'High')
})

test('praise and questions score Low', () => {
  assert.equal(calculateUrgency('Thanks for the amazing support, keep up the great work!'), 'Low')
  assert.equal(calculateUrgency('Can I upgrade my subscription to the pro plan?'), 'Low')
  assert.equal(calculateUrgency('Can you add a dark mode feature?'), 'Low')
})

test('non-blocking problems score Medium', () => {
  assert.equal(
    calculateUrgency("The dashboard won't load when I try to access it, it keeps timing out"),
    'Medium'
  )
})

test('shouting raises urgency instead of lowering it', () => {
  // Regression: the original scorer subtracted 50 points for ALL CAPS.
  assert.equal(calculateUrgency('SITE IS DOWN'), 'High')
})

test('politeness does not downgrade a genuine emergency', () => {
  // Regression: the original scorer let "please"/"thank you"/"?" bury an outage.
  assert.equal(
    calculateUrgency('Hi, could you please help? Our production integration failed and we have a deadline today. Thank you!'),
    'High'
  )
})

test('short messages are not penalised for being short', () => {
  // Regression: the original scorer subtracted up to 100 points for length.
  assert.equal(calculateUrgency('Outage!'), 'High')
})

test('scoring is deterministic and independent of the clock', () => {
  // Regression: the original scorer subtracted points on weekends and
  // outside 9am-5pm, so the same message changed urgency during the day.
  const message = 'Our payment failed and we can no longer access our account'
  assert.equal(calculateUrgency(message), calculateUrgency(message))
  assert.equal(calculateUrgency(message), 'High')
})

test('empty and whitespace-only input is Low, never a crash', () => {
  assert.equal(calculateUrgency(''), 'Low')
  assert.equal(calculateUrgency('   '), 'Low')
  assert.equal(calculateUrgency(undefined), 'Low')
})

test('only ever returns a known level', () => {
  const levels = new Set(['High', 'Medium', 'Low'])
  const samples = [
    '!!!!!!!!!!',
    'URGENT URGENT URGENT OUTAGE BREACH DATA LOSS LOCKED OUT!!!!!',
    'hi',
    'a'.repeat(5000),
  ]
  for (const sample of samples) {
    assert.ok(levels.has(calculateUrgency(sample)), `unexpected level for ${sample.slice(0, 20)}`)
  }
})
