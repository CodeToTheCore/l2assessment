import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RESPONSE_TARGETS,
  targetFor,
  dueByFor,
  slaStatus,
  summarizeFollowUps,
  formatRemaining,
} from './sla.js'

const HOUR = 60 * 60 * 1000
const NOW = Date.parse('2026-07-29T12:00:00.000Z')

/** An analysis created `hoursAgo` before NOW. */
function entry({ hoursAgo = 0, urgency = 'Medium', status = 'open', dueBy, id = 'x' } = {}) {
  return {
    id,
    message: 'test',
    urgency,
    status,
    dueBy,
    timestamp: new Date(NOW - hoursAgo * HOUR).toISOString(),
  }
}

test('response targets scale with urgency', () => {
  assert.equal(targetFor('High'), 1 * HOUR)
  assert.equal(targetFor('Medium'), 24 * HOUR)
  assert.equal(targetFor('Low'), 72 * HOUR)
  assert.deepEqual(Object.keys(RESPONSE_TARGETS), ['High', 'Medium', 'Low'])
})

test('an unknown urgency falls back to the Medium target', () => {
  assert.equal(targetFor(undefined), 24 * HOUR)
  assert.equal(targetFor('Critical'), 24 * HOUR)
})

test('an explicit dueBy is preferred over a derived one', () => {
  const explicit = new Date(NOW + 5 * HOUR).toISOString()
  assert.equal(dueByFor(entry({ dueBy: explicit })), Date.parse(explicit))
})

test('records saved before follow-up tracking still get a target', () => {
  // No dueBy field at all - derived from timestamp + urgency instead of needing
  // a migration.
  const legacy = { message: 'old', urgency: 'High', timestamp: new Date(NOW).toISOString() }
  assert.equal(dueByFor(legacy), NOW + 1 * HOUR)
})

test('a High message is overdue after an hour, on-track before that', () => {
  assert.equal(slaStatus(entry({ urgency: 'High', hoursAgo: 0 }), NOW).state, 'on-track')
  assert.equal(slaStatus(entry({ urgency: 'High', hoursAgo: 2 }), NOW).state, 'overdue')
})

test('due-soon starts at the last quarter of the window', () => {
  // Medium window is 24h, so the last 6h are "due soon".
  assert.equal(slaStatus(entry({ urgency: 'Medium', hoursAgo: 17 }), NOW).state, 'on-track')
  assert.equal(slaStatus(entry({ urgency: 'Medium', hoursAgo: 19 }), NOW).state, 'due-soon')
  assert.equal(slaStatus(entry({ urgency: 'Medium', hoursAgo: 25 }), NOW).state, 'overdue')
})

test('exactly on the deadline counts as overdue, not on-track', () => {
  assert.equal(slaStatus(entry({ urgency: 'High', hoursAgo: 1 }), NOW).state, 'overdue')
})

test('a done follow-up is never overdue', () => {
  const stale = entry({ urgency: 'High', hoursAgo: 100, status: 'done' })
  assert.equal(slaStatus(stale, NOW).state, 'done')
})

test('an unusable timestamp does not produce a false overdue', () => {
  // Better to show no target than to tell an agent something is late when we
  // cannot actually tell.
  const broken = { message: 'x', urgency: 'High', timestamp: 'not a date' }
  assert.equal(slaStatus(broken, NOW).state, 'on-track')
})

test('summarizeFollowUps buckets and counts, most overdue first', () => {
  const history = [
    entry({ id: 'a', urgency: 'High', hoursAgo: 3 }),    // overdue by 2h
    entry({ id: 'b', urgency: 'High', hoursAgo: 10 }),   // overdue by 9h
    entry({ id: 'c', urgency: 'Medium', hoursAgo: 20 }), // due soon
    entry({ id: 'd', urgency: 'Low', hoursAgo: 1 }),     // on track
    entry({ id: 'e', urgency: 'High', hoursAgo: 50, status: 'done' }),
  ]
  const summary = summarizeFollowUps(history, NOW)

  assert.deepEqual(summary.overdue.map((item) => item.id), ['b', 'a'])
  assert.deepEqual(summary.dueSoon.map((item) => item.id), ['c'])
  assert.equal(summary.open, 4)
  assert.equal(summary.done, 1)
  assert.equal(summary.needsAttention, 3)
})

test('an empty history needs no attention', () => {
  const summary = summarizeFollowUps([], NOW)
  assert.equal(summary.needsAttention, 0)
  assert.equal(summary.open, 0)
  assert.deepEqual(summary.overdue, [])
})

test('formatRemaining reads naturally in both directions', () => {
  assert.equal(formatRemaining(45 * 60 * 1000), 'in 45m')
  assert.equal(formatRemaining(3 * HOUR), 'in 3h')
  assert.equal(formatRemaining(-2 * HOUR), '2h overdue')
  assert.equal(formatRemaining(-5 * 24 * HOUR), '5d overdue')
  assert.equal(formatRemaining(NaN), 'no target')
})
