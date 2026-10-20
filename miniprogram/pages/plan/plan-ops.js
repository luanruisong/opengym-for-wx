// Plan's two removals with Undo (frontend/src/views/Plan.jsx, v1.3.11): delete a routine, take a
// routine out of the loop. Both go through the store's normal update, so sync sees an ordinary
// edit (a routine put back clears its own removal stamp, lib/sync-merge.js).
import { useStore } from '../../store/store.js'
import { useUI } from '../../store/ui.js'
import { t } from '../../lib/i18n.js'
import { deleteRoutine, restoreRoutine, routineSnapshot } from '../../lib/routines.js'
import { markUndone, undoMarks } from '../../lib/sync-merge.js'
import { queueOf } from '../../lib/queue.js'
import { scheduleModeOf, rotationIds, saveRotation, stopPass } from '../../lib/rotation.js'

const clone = v => JSON.parse(JSON.stringify(v))

/** The loop editor's save (Plan.jsx setSeq): every edit writes straight through saveRotation.
 *  Emptying the sequence stops the pass but stays on Rotation with an empty loop. */
export function setLoop(ids, label) {
  useStore.getState().update(s => {
    if (ids.length) saveRotation(s, ids, label)
    else {
      stopPass(s)
      if (s.rotation) s.rotation = Object.assign({}, s.rotation, { sequence: [] })
      s.scheduleMode = 'rotation'
    }
  })
}

/** Deletes a routine with an Undo toast in place of a confirm: the toast puts it back exactly,
 *  list place, weekdays, reschedules and loop included (lib/routines.js routineSnapshot). */
export function deleteRoutineWithUndo(id) {
  const st = useStore.getState()
  const snap = routineSnapshot(st.S, id)
  if (!snap) return false
  const before = st.S
  st.update(s => { deleteRoutine(s, id) })
  snap.marks = undoMarks(before, useStore.getState().S)
  useUI.getState().toast(t('“{0}” gone.', snap.routine.name), { action: t('Undo'), onAction: () => undoDeleteRoutine(snap) })
  return true
}
export function undoDeleteRoutine(snap) {
  let ok = false
  useStore.getState().update(s => { ok = restoreRoutine(s, snap); if (ok && snap.marks) markUndone(s, snap.marks) })
  if (!ok) useUI.getState().toast(t('It’s already back.'))
  return ok
}

/** Takes a routine out of the loop (the edit-mode minus), with an Undo. While the loop is still
 *  what the removal left, Undo puts the loop, the round and the swept pins back as they were;
 *  otherwise it slots the routine back in at its old place through the same save an edit uses. */
export function takeOutOfLoop(id, setSeq, seq, label) {
  const at = seq.indexOf(id)
  if (at < 0) return false
  const before = useStore.getState().S
  const snap = clone({ rotation: before.rotation ?? null, queue: before.queue ?? null, dayPlan: before.dayPlan ?? {} })
  setSeq(seq.filter(x => x !== id))
  const after = useStore.getState().S
  const mark = loopMark(after)
  const marks = undoMarks(before, after)
  const r = before.routines.find(x => x.id === id)
  const name = r ? r.name : id
  useUI.getState().toast(t('“{0}” is out of the loop.', name), { action: t('Undo'), onAction: () => undoTakeOut({ id, at, label, snap, mark, marks }) })
  return true
}
// What the loop looked like right after a removal: the saved loop, the pass and the mode switch.
export const loopMark = S => JSON.stringify([S.rotation ?? null, S.queue ?? null, S.scheduleMode ?? null])
export function undoTakeOut({ id, at, label, snap, mark, marks }) {
  if (!useStore.getState().S.routines.some(r => r.id === id)) {
    useUI.getState().toast(t('Too late, that one’s gone'))
    return false
  }
  useStore.getState().update(s => {
    if (loopMark(s) === mark) {
      s.rotation = snap.rotation
      s.queue = snap.queue
      const pins = Object.entries(snap.dayPlan).filter(([iso]) => s.dayPlan?.[iso] == null)
      if (pins.length) s.dayPlan = Object.assign({}, s.dayPlan || {}, Object.fromEntries(pins))
      if (marks) markUndone(s, marks)
      return
    }
    const q = queueOf(s)
    const ours = scheduleModeOf(s) === 'rotation' && (!s.queue || (!!q && !!s.rotation && q.rotationId === s.rotation.id))
    if (!ours) {
      const seq = Array.isArray(s.rotation?.sequence) ? s.rotation.sequence : null
      if (seq && !seq.includes(id)) {
        const next = seq.slice()
        next.splice(Math.min(at, next.length), 0, id)
        s.rotation = Object.assign({}, s.rotation, { sequence: next })
      }
      return
    }
    const ids = q?.ids ?? rotationIds(s)
    if (ids.includes(id)) return
    const next = ids.slice()
    next.splice(Math.min(at, next.length), 0, id)
    saveRotation(s, next, s.queue?.label || s.rotation?.label || label)
  })
  return true
}
