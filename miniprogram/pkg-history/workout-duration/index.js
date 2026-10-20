// Correcting how long a saved session ran (frontend/src/sheets.jsx WorkoutDurationEdit), opened by
// utils/sheets.js workoutDurationSheet(w, onDone). The start stays, the end follows it.
// On a real change: onDone() (the detail page closes on its return), a toast, then back.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage, back } from '../../utils/nav.js'
import { useStore } from '../../store/store.js'
import { useUI } from '../../store/ui.js'
import { t } from '../../lib/i18n.js'
import { durationMinOf, setWorkoutDuration, MAX_DURATION_MIN } from '../../lib/workout-date.js'

const toast = m => useUI.getState().toast(m)
const flags = dur => ({ durInvalid: !(dur >= 1), durTooLong: dur > MAX_DURATION_MIN })

Page(connectPage({
  data: { dur: 60, durInvalid: false, durTooLong: false },

  onLoad(query) {
    const p = pageParams(query)
    this.params = p
    if (!p.w) { back(); return }
    const dur = durationMinOf(p.w)
    this.setData(Object.assign({ dur }, flags(dur)))
  },
  onUnload() { releasePage(this.query) },

  // A cleared field reads as 0 and is refused at Save with the reason under the field.
  onDur(e) {
    const v = e.detail.value
    const dur = v == null ? 0 : Math.round(v)
    this.setData(Object.assign({ dur }, flags(dur)))
  },

  onSave() {
    if (this.done) return
    const w = this.params && this.params.w
    if (!w) return
    const { dur, durInvalid, durTooLong } = this.data
    if (durInvalid) { toast(t('Enter how long it took (at least 1 minute).')); return }
    if (durTooLong) { toast(t('That’s more than a day. Keep it to 24 hours or less.')); return }
    let changed = false
    useStore.getState().update(s => {
      const next = setWorkoutDuration(s.workouts, w, dur)
      if (next) { s.workouts = next; changed = true }
    })
    this.done = true
    if (changed) {
      const cb = this.params.onDone
      if (typeof cb === 'function') { try { cb() } catch (e) { console.error(e) } }
      toast(t('Duration changed'))
    }
    back()
  },
}))
