import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { clearHistory, readHistory, truncate, updateEntry } from '../utils/storage'
import { slaStatus, formatRemaining } from '../utils/sla'

/** Stable identity for an entry, tolerating older records saved without an id. */
function entryKey(item, index) {
  return item.id ?? `${item.timestamp}-${index}`
}

const FOLLOW_UP_STYLES = {
  overdue: 'bg-red-600 text-white',
  'due-soon': 'bg-orange-200 text-orange-900',
  'on-track': 'bg-gray-200 text-gray-800',
  done: 'bg-green-200 text-green-900',
}

const FOLLOW_UP_LABELS = {
  overdue: 'Overdue',
  'due-soon': 'Due soon',
  'on-track': 'Open',
  done: 'Done',
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

  const handleToggleDone = (item) => {
    const done = item.status === 'done'
    const updated = updateEntry(item.id, {
      status: done ? 'open' : 'done',
      completedAt: done ? null : new Date().toISOString()
    })
    if (updated) setHistory(updated)
  }

  // Newest first - this is a triage queue, not an alphabetical index.
  const sortedHistory = useMemo(
    () => [...history]
      .map((item, index) => ({ item, key: entryKey(item, index), sla: slaStatus(item) }))
      .sort((a, b) => new Date(b.item.timestamp) - new Date(a.item.timestamp)),
    [history]
  )

  const needsAttentionCount = sortedHistory.filter(
    ({ sla }) => sla.state === 'overdue' || sla.state === 'due-soon'
  ).length

  const filteredHistory = (() => {
    if (filter === 'all') return sortedHistory
    if (filter === 'needs-attention') {
      return sortedHistory.filter(
        ({ sla }) => sla.state === 'overdue' || sla.state === 'due-soon'
      )
    }
    return sortedHistory.filter(({ item }) => item.category === filter)
  })()

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
              {needsAttentionCount > 0 && (
                <button
                  onClick={() => setFilter('needs-attention')}
                  className={`px-4 py-2 rounded-lg font-semibold ${
                    filter === 'needs-attention'
                      ? 'bg-red-600 text-white'
                      : 'bg-red-100 text-red-800 hover:bg-red-200'
                  }`}
                >
                  ⏰ Needs attention ({needsAttentionCount})
                </button>
              )}
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
          {filteredHistory.map(({ item, key, sla }) => (
            <div
              key={key}
              className={`bg-white rounded-lg shadow-md overflow-hidden ${
                sla.state === 'overdue' ? 'border-l-4 border-red-600' : ''
              }`}
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
                    <div className="flex flex-wrap items-center gap-2">
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
                      <span className={`text-xs px-3 py-1 rounded-full font-semibold ${FOLLOW_UP_STYLES[sla.state]}`}>
                        {FOLLOW_UP_LABELS[sla.state]}
                        {sla.state !== 'done' && ` · ${formatRemaining(sla.msRemaining)}`}
                      </span>
                      {item.supervisorRequested && (
                        <span className="text-xs bg-red-100 text-red-900 px-3 py-1 rounded-full font-semibold">
                          🚩 Supervisor requested
                        </span>
                      )}
                      {item.review && (
                        <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
                          item.review.verdict === 'Send as is' ? 'bg-green-100 text-green-900' :
                          item.review.verdict === 'Needs edits' ? 'bg-yellow-100 text-yellow-900' :
                          'bg-red-100 text-red-900'
                        }`}>
                          Reply reviewed: {item.review.verdict}
                        </span>
                      )}
                      {item.source === 'fallback' && (
                        <span className="text-xs bg-amber-100 text-amber-900 px-3 py-1 rounded-full font-semibold">
                          Rule-based
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center ml-4 space-x-3">
                    {item.id && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleDone(item) }}
                        className={`text-xs px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap ${
                          item.status === 'done'
                            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                      >
                        {item.status === 'done' ? 'Reopen' : 'Mark done'}
                      </button>
                    )}
                    <div className="text-gray-400">
                      {expandedKey === key ? '▲' : '▼'}
                    </div>
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
                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-1">Follow-up</div>
                      <div className="text-sm text-gray-800 bg-white p-3 rounded border border-gray-200">
                        Respond by {new Date(sla.dueBy).toLocaleString()} —{' '}
                        <span className="font-semibold">
                          {FOLLOW_UP_LABELS[sla.state]}
                          {sla.state !== 'done' && ` (${formatRemaining(sla.msRemaining)})`}
                        </span>
                        {item.completedAt && (
                          <> · marked done {new Date(item.completedAt).toLocaleString()}</>
                        )}
                      </div>
                    </div>
                    {item.reply && (
                      <div>
                        <div className="text-xs font-semibold text-gray-600 mb-1">Draft Reply Sent for Review</div>
                        <div className="text-sm text-gray-800 bg-white p-3 rounded border border-gray-200 whitespace-pre-wrap">
                          {item.reply}
                        </div>
                      </div>
                    )}
                    {item.review && (
                      <div>
                        <div className="text-xs font-semibold text-gray-600 mb-1">
                          Supervisor Review — {item.review.verdict}
                        </div>
                        <div className="text-sm text-gray-800 bg-white p-3 rounded border border-gray-200">
                          {item.review.issues?.length > 0 ? (
                            <ul className="list-disc list-inside space-y-1">
                              {item.review.issues.map((issue, i) => <li key={i}>{issue}</li>)}
                            </ul>
                          ) : (
                            <span className="text-gray-600">No issues raised.</span>
                          )}
                          <div className="text-xs text-gray-500 mt-2">
                            Reviewed {new Date(item.review.reviewedAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    )}
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
