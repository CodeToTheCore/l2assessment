import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { clearHistory, readHistory, truncate } from '../utils/storage'

/** Stable identity for an entry, tolerating older records saved without an id. */
function entryKey(item, index) {
  return item.id ?? `${item.timestamp}-${index}`
}

function HistoryPage() {
  const [history, setHistory] = useState(readHistory)
  const [filter, setFilter] = useState('all')
  const [expandedKey, setExpandedKey] = useState(null)

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear all history?')) {
      clearHistory()
      setHistory([])
      setExpandedKey(null)
    }
  }

  // Newest first - this is a triage queue, not an alphabetical index.
  const sortedHistory = useMemo(
    () => [...history]
      .map((item, index) => ({ item, key: entryKey(item, index) }))
      .sort((a, b) => new Date(b.item.timestamp) - new Date(a.item.timestamp)),
    [history]
  )

  const filteredHistory = filter === 'all'
    ? sortedHistory
    : sortedHistory.filter(({ item }) => item.category === filter)

  const categories = [...new Set(history.map((item) => item.category))]

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Analysis History</h1>
              <p className="text-gray-600">View and manage past message analyses</p>
            </div>
            {history.length > 0 && (
              <button
                onClick={handleClearAll}
                className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 font-semibold"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Filter Buttons */}
          {history.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-lg font-semibold ${
                  filter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All ({history.length})
              </button>
              {categories.map(category => (
                <button
                  key={category}
                  onClick={() => setFilter(category)}
                  className={`px-4 py-2 rounded-lg font-semibold ${
                    filter === category
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {category} ({history.filter(h => h.category === category).length})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* History List */}
        {filteredHistory.length === 0 && (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <div className="text-5xl mb-4">📭</div>
            <div className="text-xl text-gray-600 mb-2">No history yet</div>
            <p className="text-gray-500 mb-6">
              Analyzed messages will appear here
            </p>
            <Link
              to="/analyze"
              className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold"
            >
              Analyze a Message
            </Link>
          </div>
        )}

        <div className="space-y-4">
          {filteredHistory.map(({ item, key }) => (
            <div
              key={key}
              className="bg-white rounded-lg shadow-md overflow-hidden"
            >
              <div
                className="p-4 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedKey(expandedKey === key ? null : key)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="text-sm text-gray-500 mb-1">
                      {new Date(item.timestamp).toLocaleString()}
                    </div>
                    <div className="text-gray-800 font-medium mb-2">
                      "{truncate(item.message, 100)}"
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-semibold">
                        {item.category}
                      </span>
                      <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
                        item.urgency === 'High' ? 'bg-red-200 text-red-900' :
                        item.urgency === 'Medium' ? 'bg-yellow-200 text-yellow-900' :
                        'bg-green-200 text-green-900'
                      }`}>
                        {item.urgency} Urgency
                      </span>
                      {item.source === 'fallback' && (
                        <span className="text-xs bg-amber-100 text-amber-900 px-3 py-1 rounded-full font-semibold">
                          Rule-based
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-gray-400 ml-4">
                    {expandedKey === key ? '▲' : '▼'}
                  </div>
                </div>
              </div>

              {expandedKey === key && (
                <div className="border-t border-gray-200 p-4 bg-gray-50">
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-1">Full Message</div>
                      <div className="text-sm text-gray-800 bg-white p-3 rounded border border-gray-200">
                        {item.message}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-1">Recommended Action</div>
                      <div className="text-sm text-gray-800 bg-purple-50 p-3 rounded border border-purple-200">
                        {item.recommendedAction}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-1">
                        {item.source === 'fallback' ? 'Rule-Based Reasoning' : 'AI Reasoning'}
                      </div>
                      <div className="bg-white p-3 rounded border border-gray-200">
                        <div className="prose prose-sm max-w-none text-gray-700">
                          <ReactMarkdown>
                            {item.reasoning}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default HistoryPage
