/**
 * Triage history persistence (localStorage).
 *
 * All reads are defensive: corrupt or legacy entries are dropped rather than
 * thrown, so a bad localStorage value can't blank out a page.
 */

const HISTORY_KEY = 'triageHistory'

// localStorage is a few MB; cap the log so writes don't start failing.
const MAX_HISTORY = 200

function isValidEntry(entry) {
  return (
    entry &&
    typeof entry === 'object' &&
    typeof entry.message === 'string' &&
    typeof entry.timestamp === 'string' &&
    !Number.isNaN(new Date(entry.timestamp).getTime())
  )
}

/**
 * Read the stored analyses, oldest first.
 *
 * @returns {Array<object>}
 */
export function readHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isValidEntry) : []
  } catch (error) {
    console.error('Could not read triage history, treating it as empty:', error)
    return []
  }
}

/**
 * Overwrite the stored analyses.
 *
 * @param {Array<object>} history
 * @returns {boolean} - false if the write failed (e.g. storage quota exceeded)
 */
export function writeHistory(history) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
    return true
  } catch (error) {
    console.error('Could not save triage history:', error)
    return false
  }
}

/**
 * Append one analysis, trimming the oldest entries past MAX_HISTORY.
 *
 * @param {object} entry
 * @returns {boolean} - whether the entry was persisted
 */
export function appendHistory(entry) {
  const history = [...readHistory(), entry].slice(-MAX_HISTORY)
  return writeHistory(history)
}

/**
 * Remove all stored analyses.
 */
export function clearHistory() {
  return writeHistory([])
}

/**
 * Stable id for a new analysis, used as a React key.
 *
 * @returns {string}
 */
export function createAnalysisId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Truncate text for previews, only adding an ellipsis when something was cut.
 *
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
export function truncate(text, maxLength) {
  if (typeof text !== 'string') return ''
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}
