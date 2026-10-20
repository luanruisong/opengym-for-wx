// The pure half of frontend/src/views/ProgressPhotos.jsx (exported there for its tests).
import { workoutMediaOf } from '../../lib/media-refs.js'
import { todayISO } from '../../lib/format.js'

/** Today's own logged workout, the latest one if there is more than one. */
export function todaysWorkout(S) {
  const today = (S.workouts || []).filter(w => w.d === todayISO())
  if (!today.length) return null
  return today.reduce((a, b) => ((b.start || 0) > (a.start || 0) ? b : a))
}

/** Every still photo across every logged workout, newest first, with its date and workout. */
export function progressPhotosOf(S) {
  const out = []
  for (const w of (S && S.workouts) || []) {
    for (const m of workoutMediaOf(w)) {
      if (m.kind === 'video') continue
      out.push({ key: (w.id || w.start || w.d) + ':' + m.hash, d: w.d, start: w.start || 0, w, m })
    }
  }
  out.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : b.start - a.start))
  return out
}

/** An already-sorted progressPhotosOf() list as { d, items }[] groups of the same date. */
export function groupByDate(photos) {
  const out = []
  for (const p of photos) {
    const last = out[out.length - 1]
    if (last && last.d === p.d) last.items.push(p)
    else out.push({ d: p.d, items: [p] })
  }
  return out
}

/** Whole days between two ISO dates, always ≥ 0. */
export function daysBetween(a, b) {
  const ms = new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')
  return Math.abs(Math.round(ms / 86400000))
}
