import test from 'node:test'
import assert from 'node:assert/strict'
import { detectSupervisorRequest } from './supervisor.js'

test('detects a direct request for a supervisor or manager', () => {
  assert.equal(detectSupervisorRequest('I want to speak to a supervisor'), true)
  assert.equal(detectSupervisorRequest('Can I talk to your manager please?'), true)
  assert.equal(detectSupervisorRequest('Put me through to someone in charge'), true)
  assert.equal(detectSupervisorRequest('Please escalate this to someone senior'), true)
  assert.equal(detectSupervisorRequest('I would like to file a formal complaint'), true)
})

test('does not fire on an angry message that asks for nobody', () => {
  // Anger is an urgency signal, not a supervisor request - they are separate fields.
  assert.equal(detectSupervisorRequest('THIS IS COMPLETELY UNACCEPTABLE AND I AM FURIOUS'), false)
  assert.equal(detectSupervisorRequest('Your product is broken again, third time this week'), false)
})

test('does not fire when the customer mentions their own manager', () => {
  assert.equal(detectSupervisorRequest('My manager asked me to follow up on this ticket'), false)
  assert.equal(detectSupervisorRequest("I'm the manager of this account and I need the invoice"), false)
  assert.equal(detectSupervisorRequest('Our project manager needs the report by Friday'), false)
  assert.equal(detectSupervisorRequest('It broke my password manager integration'), false)
})

test('is case insensitive', () => {
  assert.equal(detectSupervisorRequest('GET ME A SUPERVISOR NOW'), true)
})

test('handles empty and non-string input without throwing', () => {
  assert.equal(detectSupervisorRequest(''), false)
  assert.equal(detectSupervisorRequest('   '), false)
  assert.equal(detectSupervisorRequest(undefined), false)
  assert.equal(detectSupervisorRequest(null), false)
  assert.equal(detectSupervisorRequest(42), false)
})
