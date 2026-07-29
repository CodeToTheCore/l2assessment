import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { triageMessage, reviewAgentReply } from '../utils/llmHelper'
import { getRecommendedAction } from '../utils/templates'
import { appendHistory, createAnalysisId, updateEntry } from '../utils/storage'
import { targetFor, formatRemaining } from '../utils/sla'
import { detectAggravation } from '../utils/aggravation'
import { decideEscalation, REASON_LABELS } from '../utils/escalation'

function AnalyzePage() {
  const location = useLocation()
  // An example message handed over from the home page arrives as router state.
  const [message, setMessage] = useState(() => location.state?.message ?? '')
  const [results, setResults] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [reply, setReply] = useState('')
  const [review, setReview] = useState(null)
  const [isReviewing, setIsReviewing] = useState(false)

  const handleAnalyze = async () => {
    if (!message.trim()) {
      setError('Please enter a message to analyze.')
      return
    }

    setIsLoading(true)
    setResults(null)
    setError(null)
    setCopied(false)
    setReply('')
    setReview(null)

    try {
      // Layer 1 - classification. Category, urgency and the supervisor flag come
      // from one LLM call, with a rule-based fallback.
      const { category, urgency, supervisorRequested, reasoning, source, urgencySource } =
        await triageMessage(message)

      // Layer 2 - tone, measured from the message by rules only. Kept out of the
      // LLM call so it cannot contaminate the impact judgment.
      const { aggravated, signals: aggravationSignals } = detectAggravation(message)

      // Layer 3 - routing, which consumes the layers above and never the raw text.
      const escalation = decideEscalation({
        category,
        urgency,
        aggravated,
        customerRequestedSupervisor: supervisorRequested
      })

      // Get recommended action (template-based)
      const recommendedAction = getRecommendedAction(category, urgency, {
        supervisorRequested,
        aggravated
      })

      const createdAt = new Date()
      const analysisResult = {
        id: createAnalysisId(),
        message,
        category,
        urgency,
        supervisorRequested,
        aggravated,
        aggravationSignals,
        escalation,
        recommendedAction,
        reasoning,
        source,
        urgencySource,
        timestamp: createdAt.toISOString(),
        // Follow-up tracking: when this needs a response by, and whether it has had one.
        dueBy: new Date(createdAt.getTime() + targetFor(urgency)).toISOString(),
        status: 'open'
      }

      setResults(analysisResult)

      // Save to history
      if (!appendHistory(analysisResult)) {
        setError('This analysis could not be saved to history (browser storage is full).')
      }
    } catch (err) {
      console.error('Error analyzing message:', err)
      setError('Error analyzing message. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleReview = async () => {
    setIsReviewing(true)
    setReview(null)
    setError(null)

    try {
      const outcome = await reviewAgentReply({
        message: results.message,
        reply,
        category: results.category,
        urgency: results.urgency
      })
      setReview(outcome)

      // Keep the draft and the verdict on the record, so a supervisor can audit
      // what was reviewed and what the verdict was.
      if (outcome.available) {
        updateEntry(results.id, {
          reply,
          review: {
            verdict: outcome.verdict,
            issues: outcome.issues,
            reviewedAt: new Date().toISOString()
          }
        })
      }
    } catch (err) {
      console.error('Reply review failed:', err)
      setReview({ available: false, error: 'The review could not be completed. Please try again.' })
    } finally {
      setIsReviewing(false)
    }
  }

  const handleClear = () => {
    setMessage('')
    setResults(null)
    setError(null)
    setCopied(false)
    setReply('')
    setReview(null)
  }

  // Anything that escalated should not be answered without a second pair of eyes.
  const reviewRecommended = results?.escalation?.escalate === true

  const handleCopy = async () => {
    const text = `Category: ${results.category}\nUrgency: ${results.urgency}\nRecommendation: ${results.recommendedAction}\n\nReasoning: ${results.reasoning}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch (err) {
      console.error('Clipboard write failed:', err)
      setError('Could not copy to clipboard.')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Analyze Customer Message</h1>
          <p className="text-gray-600 mb-6">
            Paste a customer support message below to automatically categorize and prioritize.
          </p>

          {/* Input Section */}
          <div className="mb-4">
            <label htmlFor="customer-message" className="block text-sm font-semibold text-gray-700 mb-2">
              Customer Message
            </label>
            <textarea
              id="customer-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Paste customer message here..."
              className="w-full border border-gray-300 rounded-lg p-3 h-40 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={isLoading}
            />
            <div className="text-sm text-gray-500 mt-1">
              {message.length} characters
            </div>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-3">
            <button
              onClick={handleAnalyze}
              disabled={isLoading}
              className={`flex-1 py-3 rounded-lg font-semibold ${
                isLoading
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Analyzing...
                </span>
              ) : (
                'Analyze Message'
              )}
            </button>
            <button
              onClick={handleClear}
              disabled={isLoading}
              className="px-6 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Results Section */}
        {results && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Analysis Results</h2>

            {results.source === 'fallback' && (
              <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-sm">
                The AI service was unavailable, so this was categorized by the built-in
                rules instead. Check that <code>VITE_GROQ_API_KEY</code> is set.
              </div>
            )}

            {results.supervisorRequested && (
              <div className="mb-4 bg-red-50 border-2 border-red-300 text-red-900 rounded-lg p-4">
                <div className="font-bold mb-1">🚩 Supervisor requested</div>
                <p className="text-sm">
                  This customer asked to be handled by a supervisor. Hand it to one, and
                  have the reply reviewed below before it is sent.
                </p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <div className="text-sm font-semibold text-gray-600 mb-1">Category</div>
                <div className="inline-block bg-blue-100 text-blue-800 px-4 py-2 rounded-lg font-semibold">
                  {results.category}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-gray-600 mb-1">
                  Urgency Level
                  <span className="ml-2 font-normal text-gray-500">
                    ({results.urgencySource === 'llm' ? 'AI-scored' : 'rule-scored'})
                  </span>
                </div>
                <div className={`inline-block px-4 py-2 rounded-lg font-semibold ${
                  results.urgency === 'High' ? 'bg-red-200 text-red-900' :
                  results.urgency === 'Medium' ? 'bg-yellow-200 text-yellow-900' :
                  'bg-green-200 text-green-900'
                }`}>
                  {results.urgency}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-gray-600 mb-1">Escalation</div>
                <div className={`inline-block px-4 py-2 rounded-lg font-semibold ${
                  results.escalation.escalate
                    ? 'bg-orange-200 text-orange-900'
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {results.escalation.escalate ? 'Escalate' : 'No escalation'}
                  <span className="ml-2 font-normal">
                    · {REASON_LABELS[results.escalation.reason]}
                  </span>
                </div>
                {results.aggravationSignals?.length > 0 && (
                  <div className="text-xs text-gray-500 mt-1">
                    Tone signals: {results.aggravationSignals.join(', ').replace(/_/g, ' ')}
                    {!results.aggravated && ' (not enough on their own to count as aggravated)'}
                  </div>
                )}
              </div>

              <div>
                <div className="text-sm font-semibold text-gray-600 mb-1">Respond By</div>
                <div className="inline-block bg-gray-100 text-gray-800 px-4 py-2 rounded-lg font-semibold">
                  {new Date(results.dueBy).toLocaleString()}
                  <span className="ml-2 font-normal text-gray-600">
                    ({formatRemaining(new Date(results.dueBy) - Date.now())})
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Tracked as an open follow-up until it is marked done in History.
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-gray-600 mb-1">Recommended Action</div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <p className="text-gray-800">{results.recommendedAction}</p>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-gray-600 mb-1">
                  {results.source === 'fallback' ? 'Rule-Based Reasoning' : 'AI Reasoning'}
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="prose prose-sm max-w-none text-gray-700">
                    <ReactMarkdown>
                      {results.reasoning}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200 flex items-center space-x-3">
              <button
                onClick={handleCopy}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 font-semibold"
              >
                📋 Copy Results
              </button>
              {copied && (
                <span className="text-sm text-green-700 font-semibold">Copied to clipboard</span>
              )}
            </div>
          </div>
        )}

        {/* Draft reply + supervisor review */}
        {results && (
          <div className="bg-white rounded-lg shadow-md p-6 mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Draft Reply</h2>
            <p className="text-gray-600 mb-4 text-sm">
              Write the response you plan to send, then have it reviewed before it goes out.
            </p>

            {reviewRecommended && (
              <div className="mb-4 bg-orange-50 border border-orange-200 text-orange-900 rounded-lg p-3 text-sm">
                <span className="font-semibold">Review recommended.</span>{' '}
                {REASON_LABELS[results.escalation.reason]} — this reply should be checked
                before sending.
              </div>
            )}

            <label htmlFor="agent-reply" className="block text-sm font-semibold text-gray-700 mb-2">
              Your reply to the customer
            </label>
            <textarea
              id="agent-reply"
              value={reply}
              onChange={(e) => { setReply(e.target.value); setReview(null) }}
              placeholder="Type the reply you would send..."
              className="w-full border border-gray-300 rounded-lg p-3 h-32 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={isReviewing}
            />

            <div className="flex items-center space-x-3 mt-3">
              <button
                onClick={handleReview}
                disabled={isReviewing || !reply.trim()}
                className={`px-5 py-2 rounded-lg font-semibold ${
                  isReviewing || !reply.trim()
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                {isReviewing ? 'Reviewing...' : '🧑‍⚖️ Review this reply'}
              </button>
              <span className="text-sm text-gray-500">
                {reply.length} characters
              </span>
            </div>

            {review && !review.available && (
              <div className="mt-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-sm">
                Reply review is unavailable: {review.error} Judging whether a reply is
                accurate and appropriately worded needs the model, so no verdict is shown
                rather than a guessed one.
              </div>
            )}

            {review?.available && (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-sm font-semibold text-gray-600 mb-1">Supervisor Verdict</div>
                  <div className={`inline-block px-4 py-2 rounded-lg font-semibold ${
                    review.verdict === 'Send as is' ? 'bg-green-200 text-green-900' :
                    review.verdict === 'Needs edits' ? 'bg-yellow-200 text-yellow-900' :
                    'bg-red-200 text-red-900'
                  }`}>
                    {review.verdict}
                  </div>
                </div>

                {review.issues.length > 0 && (
                  <div>
                    <div className="text-sm font-semibold text-gray-600 mb-1">
                      Issues found ({review.issues.length})
                    </div>
                    <ul className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2 list-disc list-inside text-gray-800 text-sm">
                      {review.issues.map((issue, index) => (
                        <li key={index}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {review.suggestedReply && (
                  <div>
                    <div className="text-sm font-semibold text-gray-600 mb-1">Suggested rewrite</div>
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap">
                      {review.suggestedReply}
                    </div>
                    <button
                      onClick={() => { setReply(review.suggestedReply); setReview(null) }}
                      className="mt-2 text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 font-semibold"
                    >
                      Use this rewrite
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default AnalyzePage
