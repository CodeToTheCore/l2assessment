import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { readHistory, truncate } from '../utils/storage'
import { summarizeFollowUps, slaStatus, formatRemaining } from '../utils/sla'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Calendar days covered by the history, inclusive (minimum 1). */
function daysCovered(history) {
  if (history.length === 0) return 1

  const times = history.map((item) => new Date(item.timestamp).getTime())
  const first = new Date(Math.min(...times))
  const last = new Date(Math.max(...times))
  first.setHours(0, 0, 0, 0)
  last.setHours(0, 0, 0, 0)

  return Math.round((last - first) / MS_PER_DAY) + 1
}

function DashboardPage() {
  const history = useMemo(() => readHistory(), [])

  const stats = useMemo(() => {
    const today = new Date().toDateString()
    const todayMessages = history.filter(
      (item) => new Date(item.timestamp).toDateString() === today
    )
    const highUrgency = history.filter((h) => h.urgency === 'High').length

    return {
      total: history.length,
      today: todayMessages.length,
      highUrgencyPercent: history.length > 0
        ? Math.round((highUrgency / history.length) * 100)
        : 0,
      // Averaged over the days actually covered by the data, not a fixed window.
      avgPerDay: history.length > 0
        ? (history.length / daysCovered(history)).toFixed(1)
        : '0'
    }
  }, [history])

  const categoryData = useMemo(() => {
    const categories = {}
    history.forEach((item) => {
      categories[item.category] = (categories[item.category] || 0) + 1
    })
    return Object.entries(categories)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [history])

  const followUps = useMemo(() => summarizeFollowUps(history), [history])
  const supervisorRequests = useMemo(
    () => history.filter((item) => item.supervisorRequested && item.status !== 'done'),
    [history]
  )

  const urgencyData = useMemo(() => {
    const urgency = { High: 0, Medium: 0, Low: 0 }
    history.forEach((item) => {
      if (item.urgency in urgency) urgency[item.urgency] += 1
    })
    return urgency
  }, [history])

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Overview of message triage analytics</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Total Messages</div>
            <div className="text-3xl font-bold text-blue-600">{stats.total}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Today</div>
            <div className="text-3xl font-bold text-green-600">{stats.today}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">High Urgency</div>
            <div className="text-3xl font-bold text-red-600">{stats.highUrgencyPercent}%</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Avg Per Day</div>
            <div className="text-3xl font-bold text-purple-600">{stats.avgPerDay}</div>
          </div>
        </div>

        {/* Needs attention - overdue and due-soon follow-ups, plus supervisor requests */}
        {(followUps.needsAttention > 0 || supervisorRequests.length > 0) && (
          <div className="bg-white rounded-lg shadow border-l-4 border-red-500 p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                ⏰ Needs attention
              </h2>
              <Link to="/history" className="text-sm text-blue-600 hover:underline font-semibold">
                Open in History →
              </Link>
            </div>

            {supervisorRequests.length > 0 && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-900">
                <span className="font-bold">{supervisorRequests.length}</span> open{' '}
                {supervisorRequests.length === 1 ? 'message' : 'messages'} where the customer
                asked for a supervisor.
              </div>
            )}

            <div className="space-y-2">
              {[...followUps.overdue, ...followUps.dueSoon].slice(0, 8).map((item, index) => {
                const sla = slaStatus(item)
                return (
                  <div
                    key={item.id ?? `${item.timestamp}-${index}`}
                    className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-gray-800 truncate">
                        "{truncate(item.message, 80)}"
                      </div>
                      <div className="text-xs text-gray-500">
                        {item.category} · {item.urgency} urgency
                        {item.supervisorRequested && ' · 🚩 supervisor requested'}
                      </div>
                    </div>
                    <span className={`ml-3 text-xs px-3 py-1 rounded-full font-semibold whitespace-nowrap ${
                      sla.state === 'overdue'
                        ? 'bg-red-600 text-white'
                        : 'bg-orange-200 text-orange-900'
                    }`}>
                      {formatRemaining(sla.msRemaining)}
                    </span>
                  </div>
                )
              })}
            </div>

            {followUps.needsAttention > 8 && (
              <div className="text-xs text-gray-500 mt-3">
                Showing 8 of {followUps.needsAttention}. See History for the rest.
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
          {/* Category Distribution */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Category Distribution</h2>
            {categoryData.length === 0 ? (
              <div className="text-center text-gray-500 py-8">No data yet</div>
            ) : (
              <div className="space-y-3">
                {categoryData.map((cat) => {
                  const percentage = stats.total > 0 ? (cat.count / stats.total) * 100 : 0
                  return (
                    <div key={cat.name}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700">{cat.name}</span>
                        <span className="text-gray-600">{cat.count} ({percentage.toFixed(0)}%)</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Urgency Breakdown */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Urgency Breakdown</h2>
            {stats.total === 0 ? (
              <div className="text-center text-gray-500 py-8">No data yet</div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-4 h-4 bg-red-500 rounded mr-2"></div>
                    <span className="text-gray-700">High</span>
                  </div>
                  <span className="text-2xl font-bold text-red-600">{urgencyData.High}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-4 h-4 bg-yellow-500 rounded mr-2"></div>
                    <span className="text-gray-700">Medium</span>
                  </div>
                  <span className="text-2xl font-bold text-yellow-600">{urgencyData.Medium}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-4 h-4 bg-green-500 rounded mr-2"></div>
                    <span className="text-gray-700">Low</span>
                  </div>
                  <span className="text-2xl font-bold text-green-600">{urgencyData.Low}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Insights Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-6">
          <h2 className="text-lg font-bold text-blue-900 mb-2">💡 Insights</h2>
          <div className="space-y-2 text-sm text-blue-800">
            {stats.highUrgencyPercent > 30 && (
              <p>⚠️ High urgency messages represent {stats.highUrgencyPercent}% of total volume - consider additional support resources</p>
            )}
            {stats.today > 10 && (
              <p>📈 High activity today with {stats.today} messages analyzed</p>
            )}
            {stats.total === 0 && (
              <p>👋 Start by analyzing some messages to see insights here</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
