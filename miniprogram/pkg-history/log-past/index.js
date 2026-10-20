// Log a past workout (frontend/src/sheets.jsx LogPastWorkout), opened by utils/sheets.js
// logPastWorkoutSheet(initial) — the caller checks canLogPastWorkout() first. params:
// { initial } — a missed day of the plan (#284): { iso, routineIds }, or nothing.
//
// Continue on a day with no workout yet goes through store/actions.js submitPastWorkout (its
// checks, then beginBackfill), then this page goes back and the workout screen opens once it is
// gone (afterSheet). On a day that has one, the original's SameDayChoice dialog is shown here
// (in-page centred sheet) after the same checks; a choice starts beginBackfill and goes back.
// (submitPastWorkout's own choice is a menu: it would leave this page on the stack and make the
// workout screen wait a second before replacing it.)
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage, back } from '../../utils/nav.js'
import { useStore } from '../../store/store.js'
import { useUI } from '../../store/ui.js'
import { submitPastWorkout, beginBackfill } from '../../store/actions.js'
import { t, tn } from '../../lib/i18n.js'
import { todayISO, isoOf, fmtDate } from '../../lib/format.js'
import { deriveSessionName } from '../../lib/session-merge.js'
import { workoutsOn } from '../../lib/backfill.js'
import { MAX_DURATION_MIN, endsInFuture } from '../../lib/workout-date.js'
import { workoutMediaOf } from '../../lib/media-refs.js'

const PLANNED_DAY = '__planned-day'
const toast = m => useUI.getState().toast(m)

Page(connectPage({
  data: {
    date: '', dateText: '', time: '18:00', today: '', dur: 60, durInvalid: false, durTooLong: false,
    routineId: '', routineLabel: '', options: [], pickRoutine: false,
    same: false, sameTitle: '', sameRows: [],
  },

  onLoad(query) {
    const p = pageParams(query)
    const initial = p.initial && typeof p.initial.iso === 'string' ? p.initial : null
    this.initial = initial
    const S = useStore.getState().S
    const planned = [].concat((initial && initial.routineIds) || []).map(id => (S.routines || []).find(r => r.id === id)).filter(Boolean)
    this.planned = planned
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
    const date = (initial && initial.iso) || isoOf(yesterday)
    const routineId = planned.length > 1 ? PLANNED_DAY : (planned[0] && planned[0].id) || ''
    this.setData({ date, dateText: fmtDate(date, true, true), today: todayISO(), routineId })
    this.__refresh && this.__refresh()
  },
  onUnload() { releasePage(this.query) },

  mapState(S) {
    const planned = this.planned || []
    const options = [
      { value: '', label: t('Freestyle') },
      ...(planned.length > 1 ? [{ value: PLANNED_DAY, label: deriveSessionName(planned.map(r => r.name)) }] : []),
      ...(S.routines || []).map(r => ({ value: r.id, label: r.name })),
    ]
    const rid = this.data.routineId
    const cur = options.find(o => o.value === rid) || options[0]
    return {
      options: options.map((o, i) => ({ i, label: o.label, on: o.value === cur.value })),
      routineLabel: cur.label,
    }
  },
  optionsRaw() {
    const S = useStore.getState().S
    const planned = this.planned || []
    return [
      '',
      ...(planned.length > 1 ? [PLANNED_DAY] : []),
      ...(S.routines || []).map(r => r.id),
    ]
  },

  onDate(e) { const date = e.detail.value; this.setData({ date, dateText: fmtDate(date, true, true) }) },
  onTime(e) { this.setData({ time: e.detail.value }) },
  onDur(e) {
    const v = e.detail.value
    const dur = v == null ? 0 : Math.round(v)
    this.setData({ dur, durInvalid: !(dur >= 1), durTooLong: dur > MAX_DURATION_MIN })
  },

  onRoutineOpen() { this.setData({ pickRoutine: true }) },
  onRoutineClose() { this.setData({ pickRoutine: false }) },
  onRoutinePick(e) {
    const value = this.optionsRaw()[+e.currentTarget.dataset.i]
    this.setData({ routineId: value == null ? '' : value, pickRoutine: false })
    this.__refresh()
  },

  routineIds() {
    const rid = this.data.routineId
    return rid === PLANNED_DAY ? this.planned.map(r => r.id) : rid ? [rid] : []
  },

  onSubmit() {
    if (this.done) return
    const { date, time, dur } = this.data
    const S = useStore.getState().S
    const existing = date ? workoutsOn(S, date) : []
    if (!existing.length) {
      if (submitPastWorkout({ iso: date, time, durationMin: dur, routineIds: this.routineIds() })) {
        this.done = true
        back()
      }
      return
    }
    // The same checks as submitPastWorkout, then the three ways out.
    if (!date || date > todayISO()) { toast(t('Pick a day up to today')); return }
    if (!(dur >= 1)) { toast(t('Enter how long it took (at least 1 minute).')); return }
    if (dur > MAX_DURATION_MIN) { toast(t('That’s more than a day. Keep it to 24 hours or less.')); return }
    if (endsInFuture(date, time, dur)) { toast(t('That’s still in the future. Try an earlier start.')); return }
    this.existing = existing
    this.setData({
      same: true,
      sameTitle: fmtDate(date, true),
      sameRows: existing.map((w, i) => {
        // Replacing re-logs the sets; the photos and videos move to the new record (completeBackfill).
        const n = workoutMediaOf(w, Infinity).length
        return {
          i,
          label: existing.length > 1 ? t('Replace') + ' · ' + w.name : t('Replace'),
          media: n > 0 ? tn('Its photo or video moves to the new workout.', 'Its {0} photos or videos move to the new workout.', n) : '',
        }
      }),
    })
  },
  go(replaceId) {
    if (this.done) return
    this.done = true
    const { date, time, dur } = this.data
    this.setData({ same: false })
    beginBackfill({ iso: date, time, durationMin: Math.max(1, dur), routineIds: this.routineIds(), replaceId: replaceId || null })
    back()
  },
  onReplace(e) {
    const w = this.existing && this.existing[+e.currentTarget.dataset.i]
    if (w) this.go(w.id)
  },
  onAddSecond() { this.go(null) },
  onSameClose() { this.setData({ same: false }) },
}))
