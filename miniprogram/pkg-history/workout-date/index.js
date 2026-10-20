// Correcting when a saved session happened (frontend/src/sheets.jsx WorkoutDateEdit), opened by
// utils/sheets.js workoutDateSheet(w, onDone). Only its place in history moves; the session keeps
// its length, and the PR badges are worked out again (lib/workout-date.js moveWorkout).
// On a real move: onDone() (the detail page closes on its return), a toast, then back.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage, back } from '../../utils/nav.js'
import { useStore } from '../../store/store.js'
import { useUI } from '../../store/ui.js'
import { t } from '../../lib/i18n.js'
import { todayISO, fmtDate } from '../../lib/format.js'
import { moveWorkout, sameWorkout, startTimeOf, durationMinOf, endsInFuture } from '../../lib/workout-date.js'

const toast = m => useUI.getState().toast(m)

Page(connectPage({
  data: { date: '', time: '', today: '', dateText: '' },

  onLoad(query) {
    const p = pageParams(query)
    this.params = p
    const w = p.w
    if (!w) { back(); return }
    const today = todayISO()
    this.setData({ date: w.d || today, time: startTimeOf(w), today, dateText: fmtDate(w.d || today, true, true) })
  },
  onUnload() { releasePage(this.query) },

  onDate(e) { const date = e.detail.value; this.setData({ date, dateText: fmtDate(date, true, true) }) },
  onTime(e) { this.setData({ time: e.detail.value }) },

  onSave() {
    if (this.done) return
    const w = this.params && this.params.w
    if (!w) return
    const { date, time } = this.data
    const today = todayISO()
    if (!date || date > today) { toast(t('Pick a day up to today')); return }
    // Nothing to do: a no-op save and a workout deleted from another page both just close.
    if (date === w.d && time === startTimeOf(w)) { this.finish(); return }
    if (!(useStore.getState().S.workouts || []).some(x => sameWorkout(x, w))) { this.finish(); return }
    // It keeps its length, so the end it would have is what has to be in the past.
    if (endsInFuture(date, time, durationMinOf(w))) { toast(t('That’s still in the future. Try an earlier start.')); return }
    useStore.getState().update(s => {
      const next = moveWorkout(s.workouts, w, date, time)
      if (next) s.workouts = next
    })
    const cb = this.params.onDone
    if (typeof cb === 'function') { try { cb() } catch (e) { console.error(e) } }
    toast(t('Workout moved'))
    this.finish()
  },
  finish() {
    this.done = true
    back()
  },
}))
