// History (frontend/src/views/History.jsx): every workout newest first, and between them the days
// off you left a note on (#261). Rendered in batches of BATCH rows: each batch is its own data key
// (`pages[k]`), so the first screen is one small setData and scrolling down adds one batch at a
// time; a store change re-sends only the batches whose rows changed.
import { connectPage } from '../../utils/page.js'
import { workoutDetailSheet, logPastWorkoutSheet, calendarSheet } from '../../utils/sheets.js'
import { canLogPastWorkout } from '../../store/actions.js'
import { dayNoteOf } from '../../lib/day-notes.js'
import { tn } from '../../lib/i18n.js'
import { workoutRowOf, dayNoteRowOf } from '../components/rows.js'

const BATCH = 30

// Newest first: every workout, and in between them the days off you left a note on (#261). A
// note on a day that has a workout too stays in the day sheet; the workout speaks for that day.
export function historyRows(S) {
  const trained = new Set((S.workouts || []).map(w => w && w.d))
  const notes = Object.keys(S.dayNotes || {}).filter(d => !trained.has(d)).map(d => ({ d, note: dayNoteOf(S, d) })).filter(x => x.note)
  const rows = [...(S.workouts || []).map(w => ({ d: w.d, w })), ...notes]
  // Stable, so workouts keep the order they are stored in (by day, then start) within a day.
  return rows.map((r, i) => [r, i]).sort((a, b) => (a[0].d < b[0].d ? 1 : a[0].d > b[0].d ? -1 : b[1] - a[1])).map(([r]) => r)
}

Page(connectPage({
  data: { sub: '', empty: false, pages: [] },

  mapState(S) {
    if (this._S !== S) {
      this._S = S
      const raw = historyRows(S)
      this._raw = raw
      this._rows = raw.map((r, i) => r.w
        ? Object.assign({ kind: 'w', i }, workoutRowOf(S, r.w, r.w.id != null ? 'w-' + r.w.id : 'wi-' + i))
        : Object.assign({ kind: 'n', i }, dayNoteRowOf(r.d, r.note)))
      this._sendPages()
    }
    return {
      sub: tn('{0} workout', '{0} workouts', (S.workouts || []).length),
      empty: this._rows.length === 0,
    }
  },

  // Sends the batches up to `this._shown` whose JSON changed; a shorter list resends the lot.
  _sendPages() {
    if (!this._shown) this._shown = 1
    if (!this._sent) this._sent = []
    const rows = this._rows || []
    const n = Math.min(this._shown, Math.max(1, Math.ceil(rows.length / BATCH)))
    const batch = k => ({ k, rows: rows.slice(k * BATCH, (k + 1) * BATCH) })
    if (this._sent.length > n) {
      const pages = []
      this._sent = []
      for (let k = 0; k < n; k++) { const b = batch(k); pages.push(b); this._sent[k] = JSON.stringify(b) }
      this.setData({ pages })
      return
    }
    const patch = {}
    let changed = false
    for (let k = 0; k < n; k++) {
      const b = batch(k)
      const json = JSON.stringify(b)
      if (this._sent[k] !== json) { this._sent[k] = json; patch['pages[' + k + ']'] = b; changed = true }
    }
    if (changed) this.setData(patch)
  },

  onReachBottom() {
    const rows = this._rows || []
    if (this._shown * BATCH >= rows.length) return
    this._shown++
    this._sendPages()
  },

  onOpen(e) {
    const i = +e.detail.i
    const r = this._raw && this._raw[i]
    if (r && r.w) workoutDetailSheet(r.w)
  },
  onLogPast() {
    if (!canLogPastWorkout()) return
    // History's button: no day from the plan, so no `initial`.
    logPastWorkoutSheet(null)
  },
  onCalendar() { calendarSheet() },
}))
