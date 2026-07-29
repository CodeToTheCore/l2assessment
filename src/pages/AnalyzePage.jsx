import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { triageMessage } from '../utils/llmHelper'
import { getRecommendedAction } from '../utils/templates'
import { appendHistory, createAnalysisId } from '../utils/storage'

function AnalyzePage() {
  const location = useLocation()
  // An example message handed over from the home page arrives as router state.
  const [message, setMessage] = useState(() => location.state?.message ?? '')
  const [results, setResults] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  const handleAnalyze = async () => {
    if (!message.trim()) {
      setError('Please enter a message to analyze.')
      return
    }

    setIsLoading(true)
    setResults(null)
    setError(null)
    setCopied(false)

    try {
      // Category + urgency come from one LLM call, with a rule-based fallback
      const { category, urgency, reasoning, source, urgencySource } =
        await triageMessage(message)

      // Get recommended action (template-based)
      const recommendedAction = getRecommendedAction(category, urgency)

      const analysisResult = {
        id: createAnalysisId(),
        message,
        category,
        urgency,
        recommendedAction,
        reasoning,
        source,
        urgencySource,
        timestamp: new Date().toISOString()
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

  const handleClear = () => {
    setMessage('')
    setResults(null)
    setError(null)
    setCopied(false)
  }

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
      </div>
    </div>
  )
}

export default AnalyzePage
