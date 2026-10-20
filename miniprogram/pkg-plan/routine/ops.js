// Pure-ish routine list operations of the routine editor (frontend/src/views/RoutineEdit.jsx):
// whole-unit reorder (the web app's drag; kept for parity and tests), the arrows' move, the
// superset link toggle, and remove-with-Undo.
import { useStore } from '../../store/store.js'
import { useUI } from '../../store/ui.js'
import { exOr } from '../../lib/exercises.js'
import { uid, exerciseNameText } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { supersetUnits, moveRoutineEntry, cleanupSg } from '../../lib/history.js'
import { markEntryUndone } from '../../lib/sync-merge.js'

const clamp = (value, low, high) => Math.max(low, Math.min(high, value))
const clone = v => JSON.parse(JSON.stringify(v))

// Slots are defined after removing the source unit, so a grouped run can never be split.
export function reorderRoutineUnit(exercises, sourceIndex, targetSlot) {
  if (!Array.isArray(exercises) || !exercises.length) return false
  const units = supersetUnits(exercises)
  const sourcePosition = units.findIndex(unit => unit.includes(sourceIndex))
  if (sourcePosition < 0) return false
  const remaining = units.filter((_, position) => position !== sourcePosition)
  const slot = clamp(Number.isFinite(targetSlot) ? Math.trunc(targetSlot) : sourcePosition, 0, remaining.length)
  if (slot === sourcePosition) return false
  const source = units[sourcePosition]
  const moved = exercises.splice(source[0], source.length)
  const insertAt = remaining.slice(0, slot).reduce((count, unit) => count + unit.length, 0)
  exercises.splice(insertAt, 0, ...moved)
  cleanupSg(exercises)
  return true
}

// The arrows (#377): moves exercise `i` one step in place (lib/history.js moveRoutineEntry).
// Returns false (and leaves `ex` alone) when the press would do nothing.
export function moveEntry(ex, i, dir) {
  const reordered = moveRoutineEntry(ex, i, dir)
  if (!reordered) return false
  ex.splice(0, ex.length, ...reordered)
  cleanupSg(ex)
  return true
}

// The link button: joins exercise `i` to the one above, or unlinks it.
export function toggleLink(ex, i) {
  if (i < 1 || i >= ex.length) return
  const cur = ex[i], prev = ex[i - 1]
  if (cur.sg && prev.sg && cur.sg === prev.sg) delete cur.sg
  else { const gid = prev.sg || ('sg' + uid()); prev.sg = gid; cur.sg = gid }
  cleanupSg(ex)
}

/**
 * Takes exercise `i` out of routine `routineId` with an Undo. While the routine's exercises are
 * still what the removal left, Undo puts the list back as it was, superset links included. Once
 * something else changed them, the exercise goes back in at its old place.
 */
export function removeRoutineExercise(routineId, i) {
  const st = useStore.getState()
  const routine = st.S.routines.find(x => x.id === routineId)
  const slot = routine && routine.ex && routine.ex[i]
  if (!slot) return false
  const before = clone(routine.ex)
  const base = Number(routine._f && routine._f.ex) || 0
  st.update(s => {
    const r = s.routines.find(x => x.id === routineId)
    const ex = r && r.ex
    if (!ex) return
    ex.splice(i, 1); cleanupSg(ex)
  })
  const now = useStore.getState().S.routines.find(x => x.id === routineId)
  const after = JSON.stringify(now && now.ex)
  const del = Number(now && now._f && now._f.ex) || 0
  useUI.getState().toast(t('“{0}” left the routine.', exerciseNameText(exOr(slot.id))),
    { action: t('Undo'), onAction: () => undoRemoveRoutineExercise({ routineId, i, before, after, base, del }) })
  return true
}

export function undoRemoveRoutineExercise({ routineId, i, before, after, base, del }) {
  if (!useStore.getState().S.routines.some(x => x.id === routineId)) {
    useUI.getState().toast(t('Too late, that one’s gone'))
    return false
  }
  useStore.getState().update(s => {
    const routine = s.routines.find(x => x.id === routineId)
    if (JSON.stringify(routine.ex) === after) {
      routine.ex = clone(before)
      if (del) markEntryUndone(routine, 'ex', base, del)
      return
    }
    routine.ex.splice(Math.min(i, routine.ex.length), 0, clone(before[i]))
    cleanupSg(routine.ex)
  })
  return true
}
