// The month calendar (frontend/src/sheets.jsx Calendar), opened by utils/sheets.js
// calendarSheet(start). params: { start } — an ISO day whose month opens first (default today).
//
// A tap on a day leaves this page for the next one (the original closed the calendar first):
// no workout → that day's plan override (pkg-plan/day-override), one → its detail, several →
// a list in an in-page sheet, then the detail. The next page replaces this one (redirect), so
// there is no back-then-open race and the stack does not grow.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage, openPage } from '../../utils/nav.js'
import { t, tn } from '../../lib/i18n.js'
import { fmtDate, fmtDur, fmtVol, todayISO, weekStartOf, weekOrder, weekDayOffset, DAYS } from '../../lib/format.js'
import { workoutDay, effectiveRoutineIds } from '../../lib/history.js'
import { pinState } from '../../lib/queue.js'
import { dayNoteOf } from '../../lib/day-notes.js'
import { workoutRowOf } from '../components/rows.js'

// The same paths and parameters as utils/sheets.js dayOverrideSheet / workoutDetailSheet.
const DAY_OVERRIDE = '/pkg-plan/day-override/index'
const WORKOUT_DETAIL = '/pkg-history/workout-detail/index'
const pad2 = n => String(n).padStart(2, '0')

Page(connectPage({
  data: { title: '', summary: '', heads: [], cells: [], showNoteLegend: false, pick: false, pickTitle: '', pickRows: [] },

  onLoad(query) {
    const p = pageParams(query)
    const d = p.start ? new Date(String(p.start).slice(0, 10) + 'T12:00:00') : new Date()
    const base = isNaN(d.getTime()) ? new Date() : d
    this.cur = { y: base.getFullYear(), mo: base.getMonth() }
    this.__refresh && this.__refresh()
  },
  onUnload() { releasePage(this.query) },

  mapState(S) {
    if (!this.cur) return {}
    const { y, mo } = this.cur
    if (this._S !== S) {
      this._S = S
      const byDay = {}
      ;(S.workouts || []).forEach(w => {
        const day = workoutDay(w)
        if (day) (byDay[day] = byDay[day] || []).push(w)
      })
      this.byDay = byDay
    }
    const byDay = this.byDay
    const today = todayISO()
    const ws = weekStartOf(S)
    const startOffset = weekDayOffset(new Date(y, mo, 1).getDay(), ws)
    const daysIn = new Date(y, mo + 1, 0).getDate()
    const prefix = y + '-' + pad2(mo + 1)
    const monthWs = (S.workouts || []).filter(w => (workoutDay(w) || '').startsWith(prefix))
    const monthVol = monthWs.reduce((a, w) => a + (w.vol || 0), 0)
    const monthMs = monthWs.reduce((a, w) => a + Math.max(0, (w.end || w.start) - w.start), 0)
    const cells = []
    for (let i = 0; i < startOffset; i++) cells.push({ k: 'e' + i, blank: true })
    for (let d = 1; d <= daysIn; d++) {
      const iso = prefix + '-' + pad2(d)
      const wsOn = byDay[iso]
      const planned = effectiveRoutineIds(S, iso).length > 0
      // A fulfilled pin reads as no override, as it does everywhere else.
      const ovr = S.dayPlan && S.dayPlan[iso] !== undefined && pinState(S, S.dayPlan[iso]) !== 'done'
      // A day off with a note on it (#261) shows the note's dot instead of the plan's.
      const note = !wsOn && dayNoteOf(S, iso)
      const dot = wsOn ? 'done' : note ? 'noted' : ovr && planned ? 'ovr' : planned ? 'plan' : ''
      cells.push({
        k: iso, iso, d, blank: false, dot,
        cls: (wsOn ? ' has' : '') + (note ? ' noted' : '') + (iso === today ? ' today' : ''),
      })
    }
    return {
      // The original wrote t(MONTHS_LONG[mo]) + ' ' + y ("十月 2026"); the Chinese order reads better.
      title: y + '年' + (mo + 1) + '月',
      summary: monthWs.length
        ? `${tn('{0} workout', '{0} workouts', monthWs.length)} · ${fmtDur(monthMs)} · ${fmtVol(monthVol, S.unit)}`
        : t('No workouts this month'),
      heads: weekOrder(ws).map(d => ({ k: d, label: t(DAYS[d]) })),
      cells,
      showNoteLegend: Object.keys(S.dayNotes || {}).some(k => k.startsWith(prefix) && dayNoteOf(S, k)),
    }
  },

  onPrev() { this.shift(-1) },
  onNext() { this.shift(1) },
  shift(n) {
    const d = new Date(this.cur.y, this.cur.mo + n, 1)
    this.cur = { y: d.getFullYear(), mo: d.getMonth() }
    this.__refresh()
  },

  onDay(e) {
    const iso = e.currentTarget.dataset.iso
    if (!iso) return
    const wsOn = (this.byDay && this.byDay[iso]) || []
    if (!wsOn.length) { openPage(DAY_OVERRIDE, { iso }, { redirect: true }); return }
    if (wsOn.length === 1) { openPage(WORKOUT_DETAIL, { w: wsOn[0] }, { redirect: true }); return }
    const S = this._S
    this.pickList = wsOn
    this.setData({
      pick: true,
      pickTitle: fmtDate(iso, true),
      pickRows: wsOn.map((w, i) => Object.assign({ i }, workoutRowOf(S, w, 'p' + i + '-' + (w.id || '')))),
    })
  },
  onPickClose() { this.setData({ pick: false }) },
  onPickOpen(e) {
    const w = this.pickList && this.pickList[+e.detail.i]
    if (!w) return
    this.setData({ pick: false })
    openPage(WORKOUT_DETAIL, { w }, { redirect: true })
  },
}))
