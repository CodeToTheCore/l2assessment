import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { readHistory } from '../utils/storage'
import { summarizeFollowUps } from '../utils/sla'

// How often to re-check whether a follow-up has gone overdue while the app sits open.
const TICK_MS = 30 * 1000

function Navigation() {
  const location = useLocation()

  // A timer so an item can go overdue in place, without the user having to click
  // anything. Each tick re-renders, which re-reads the badge counts below.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), TICK_MS)
    return () => clearInterval(id)
  }, [])

  // Computed on every render (navigation or tick) rather than memoised against a
  // dependency list this doesn't actually read - it is one localStorage read of
  // at most 200 records.
  const followUps = summarizeFollowUps(readHistory())

  const isActive = (path) => {
    return location.pathname === path
  }

  return (
    <nav className="bg-blue-600 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2 hover:opacity-80">
            <div className="bg-white rounded-full w-10 h-10 flex items-center justify-center text-2xl">
              📧
            </div>
            <div>
              <div className="font-bold text-lg">Relay AI</div>
              <div className="text-xs text-blue-200">Customer Triage</div>
            </div>
          </Link>

          {/* Navigation Links */}
          <div className="flex space-x-1">
            <Link
              to="/"
              className={`px-4 py-2 rounded ${
                isActive('/') 
                  ? 'bg-blue-700 font-semibold' 
                  : 'hover:bg-blue-500'
              }`}
            >
              Home
            </Link>
            <Link
              to="/analyze"
              className={`px-4 py-2 rounded ${
                isActive('/analyze') 
                  ? 'bg-blue-700 font-semibold' 
                  : 'hover:bg-blue-500'
              }`}
            >
              Analyze
            </Link>
            <Link
              to="/history"
              className={`px-4 py-2 rounded flex items-center ${
                isActive('/history')
                  ? 'bg-blue-700 font-semibold'
                  : 'hover:bg-blue-500'
              }`}
            >
              History
              {followUps.overdue.length > 0 ? (
                <span
                  className="ml-2 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full"
                  title={`${followUps.overdue.length} follow-up(s) past their response target`}
                >
                  {followUps.overdue.length} overdue
                </span>
              ) : followUps.dueSoon.length > 0 && (
                <span
                  className="ml-2 bg-orange-400 text-orange-950 text-xs font-bold px-2 py-0.5 rounded-full"
                  title={`${followUps.dueSoon.length} follow-up(s) due soon`}
                >
                  {followUps.dueSoon.length} due soon
                </span>
              )}
            </Link>
            <Link
              to="/dashboard"
              className={`px-4 py-2 rounded ${
                isActive('/dashboard') 
                  ? 'bg-blue-700 font-semibold' 
                  : 'hover:bg-blue-500'
              }`}
            >
              Dashboard
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}

export default Navigation
