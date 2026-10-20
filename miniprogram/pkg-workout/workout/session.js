// Everything the running workout screen does to the session (frontend/src/views/Workout.jsx
// ActiveWorkout and ExerciseBlock handlers), shared by the page and its block components.
// Module state stands in for the original's refs: one workout screen exists at a time.
//
// Every rule is a lib call (supersetFlow, history, workout-model, active-workout-order,
// session-start, session-noprog, routines…), wired exactly as the original wired it.
import { useStore } from '../../store/store.js'
import { useUI } from '../../store/ui.js'
import { exOr } from '../../lib/exercises.js'
import { dropGrid } from '../../lib/plates.js'
import {
  bestWeightForEntry, buildSets, freestyleConfig, defaultConfig, supersetUnits, unitOf, modeOf, isPerSide,
  stepEffort, cascadeWeight, insertWarmupRow, barFloor, makeWarmupAt, makeWorkAt, removeRowAt, removeLastSet,
  setSpanAt, copyRowAt, copySpanAt, insertRowAt, pairAdjacent, unpairSuperset, cleanupSg, applyIntensifierPlan, setLabel,
  canBeWarmup,
} from '../../lib/history.js'
import { fmtRest, REST_MAX } from '../../lib/duration.js'
import { exerciseNameText, fmtDate } from '../../lib/format.js'
import { inclineFrom } from '../../lib/incline.js'
import { speedUnitOf } from '../../lib/speed.js'
import { beep, vibrate, unlock } from '../../lib/sound.js'
import { t, exerciseNameFor } from '../../lib/i18n.js'
import { pyramidRestFor } from '../../lib/pyramid.js'
import {
  insertionIndexAfterCurrentUnit, nextUnfinishedUnit, setProgressHighWater, supersetFlowStep, restAfterSet,
  restOnRecheck, restSecFor, warmupRestSecFor,
} from '../lib/supersetFlow.js'
import { workoutControls } from '../../lib/workout-controls.js'
import { defaultIncrement, weightIncrement } from '../../lib/progression.js'
import { progressionGuidance } from '../lib/progression-copy.js'
import { buildPlannedEntry, plannedConfigOf, builtOutOfProgression } from '../../lib/session-start.js'
import { routineChangesFromEntry, updateRoutineFromEntry } from '../../lib/routines.js'
import { sessionNoProg, setSessionNoProg, setEntryNoProg, joinSessionNoProg } from '../../lib/session-noprog.js'
import { markAllSetsDone, sessionHistory } from '../../lib/backfill.js'
import {
  isWarmupRow, isFailureSet, toggleFailure, isDropSet, isRestPauseSet, dropsOf, clustersOf, addDrop, addCluster,
  removeDropAt, removeClusterAt, setDropAt, setClusterAt, nextDropWeight, nextBurstReps, isSideSet, makeSideSet,
  setSideField, toggleSide, addSideDrop, removeSideDropAt, setSideDropAt, addSideCluster, removeSideClusterAt,
  setSideClusterAt, WEIGHT_ORIGIN_MANUAL,
} from '../../lib/workout-model.js'
import { canMoveActiveWorkoutUnit, moveActiveWorkoutUnit, canMoveActiveWorkoutEntry, moveActiveWorkoutEntry } from '../lib/active-workout-order.js'
import { withMeaning, historyAs, dbLoadFor, ownedWeightsFor } from '../../lib/dumbbells.js'
import {
  confirmSheet, menuSheet, exercisePicker, exConfigSheet, exerciseDetailSheet, exerciseNoteSheet,
  sessionNoteSheet, renameWorkoutSheet, barWeightSheet, effortPickerSheet, exerciseHistorySheet,
  addRoutineToSessionSheet, workoutSettingsSheet, durationSheet,
} from '../../utils/sheets.js'
import { openPage } from '../../utils/nav.js'
import { swapActiveWorkoutExercise, discardWorkout as discardWithConfirm } from '../../store/actions.js'
import { setNumberAt, loadSummaryOf, restSubOf } from './block-model.js'

const SWITCH_SIDES_SEC = 10

const St = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const UI = () => useUI.getState()
const setUI = patch => useUI.setState(patch)
const toast = (m, o) => UI().toast(m, o)

// The page registers what only it can do (scrolling); all optional.
export const hooks = { revealCur: null, scrollToUnit: null, onCurMoved: null }

/* ---------- the view the session is in ---------- */
export function viewOf(S) {
  const A = S.active
  const requested = (A && A.workoutView) || S.workoutView
  const view = ['list', 'compact', 'focus'].includes(requested) ? requested : 'cards'
  return { view, listMode: view === 'list' || view === 'compact', focusMode: view === 'focus', dense: view === 'compact' }
}
export const editingOf = S => !!(S.active && S.active.editingWorkoutId)
const curOf = A => (Number.isInteger(A.cur) ? Math.min(Math.max(A.cur, 0), Math.max(0, A.entries.length - 1)) : 0)
export const collapseOnOf = S => viewOf(S).listMode && !!(S.active.collapseCompleted != null ? S.active.collapseCompleted : S.collapseCompleted)

// A past workout has no rest to time; neither has the editor of a saved one.
const startRest = (sec, forIdx, opts) => {
  const A = St().active
  if (!A || A.backfill || A.editingWorkoutId) return
  UI().startRest(sec, forIdx, opts)
}

/* ---------- progress marks (the original's progressHighWater ref and its effects) ---------- */
let marks = []
let lastCounts = null
const marksOf = A => A.entries.map(e => e.sets.filter(s => s.done).length)
export function resetMarks() {
  const A = St().active
  marks = A ? marksOf(A) : []
  lastCounts = A ? A.entries.map(e => e.sets.length) : null
}
// Called on every render of the page: re-baseline on a change of length; a removed set lowers
// its exercise's mark to what is ticked now.
export function trackMarks(A) {
  if (!A) return
  const counts = A.entries.map(e => e.sets.length)
  if (!lastCounts || counts.length !== lastCounts.length) {
    marks = marksOf(A)
  } else {
    counts.forEach((n, k) => {
      if (n < lastCounts[k]) marks[k] = Math.min(marks[k] || 0, A.entries[k].sets.filter(s => s.done).length)
    })
  }
  lastCounts = counts
}

// Focus view's set pointers reset whenever an index-shifting edit happens.
export let focusEpoch = 0
const bumpEpoch = () => { focusEpoch++ }

/* ---------- swipe / set-menu: delete, undo, copy ---------- */
let holdAt = null    // { owner, idx, i }: the row a running hold will write to
let flashSeq = 0
const shiftRowRefs = (idx, from, by) => {
  if (holdAt && holdAt.idx === idx && holdAt.i >= from) holdAt = { ...holdAt, i: holdAt.i + by }
  const wk = UI().work
  if (wk && wk.owner && wk.owner.idx === idx && wk.owner.i >= from) setUI({ work: { ...wk, owner: { ...wk.owner, i: wk.owner.i + by } } })
  const rest = UI().timer
  if (rest && rest.forIdx === idx && rest.forSet != null && rest.forSet >= from) setUI({ timer: { ...rest, forSet: rest.forSet + by } })
}

export function deleteActiveSet(idx, i, { editing = false } = {}) {
  const A = St().active
  const e = A && A.entries && A.entries[idx]
  const row = e && e.sets && e.sets[i]
  if (!row) return false
  const ui = UI()
  const [start, count] = setSpanAt(e.sets, i)
  if (!editing && e.sets.length <= count) { ui.toast(t('Keep at least one set, champ')); return false }
  const inSpan = j => j != null && j >= start && j < start + count
  let stopped = false
  const holdHere = ui.work && ((holdAt && holdAt.idx === idx && inSpan(holdAt.i)) || (ui.work.owner && ui.work.owner.idx === idx && inSpan(ui.work.owner.i)))
  if (holdHere) { holdAt = null; ui.stopWork(); stopped = true }
  const rest = ui.timer
  if (rest && rest.forIdx === idx && inSpan(rest.forSet)) { ui.stopRest(); stopped = !rest.ready || stopped }
  shiftRowRefs(idx, start + count, -count)
  const n = setNumberAt(e.sets, i)
  const warm = isWarmupRow(row)
  const token = { activeId: A.id, idx, entryId: e.id, i: start, rows: JSON.parse(JSON.stringify(e.sets.slice(start, start + count))) }
  update(s => {
    const en = s.active && s.active.entries && s.active.entries[idx]
    if (!en) return
    if (editing) en.sets.splice(start, count)
    else en.sets = removeRowAt(en.sets, i)
  }, true)
  const msg = warm ? t('Warm-up gone.') : stopped ? t('Set {0} gone. Its timer stopped too.', n) : t('Set {0} gone.', n)
  UI().toast(msg, { action: t('Undo'), onAction: () => undoDeleteSet(token) })
  return true
}

export function undoDeleteSet(token) {
  const A = St().active
  const at = !A || A.id !== token.activeId ? -1
    : (A.entries[token.idx] && A.entries[token.idx].id === token.entryId) ? token.idx
      : A.entries.findIndex(en => en.id === token.entryId)
  if (at < 0) { toast(t('Too late, that one’s gone')); return false }
  const rows = token.rows || [token.row]
  const i = Math.min(token.i, A.entries[at].sets.length)
  shiftRowRefs(at, i, rows.length)
  update(s => {
    const en = s.active.entries[at]
    en.sets = rows.reduce((acc, r, k) => insertRowAt(acc, i + k, r), en.sets)
  }, true)
  setUI({ setFlash: { idx: at, i, id: ++flashSeq } })
  return true
}

export function copyActiveSet(idx, i) {
  const e = St().active && St().active.entries && St().active.entries[idx]
  if (!e || !e.sets || !e.sets[i]) return false
  const { start, end } = copySpanAt(e.sets, i)
  shiftRowRefs(idx, end + 1, end - start + 1)
  update(s => {
    const en = s.active && s.active.entries && s.active.entries[idx]
    if (en) en.sets = copyRowAt(en.sets, i)
  }, true)
  setUI({ setFlash: { idx, i: end + 1, id: ++flashSeq } })
  toast(t('Copied. One more like that one.'))
  return true
}
export const removeSetAt = (idx, i) => deleteActiveSet(idx, i, { editing: editingOf(St()) })

/* ---------- removing an exercise ---------- */
export function removeActiveExercise(idx) {
  UI().stopWork()
  const rest = UI().timer
  if (rest && rest.forIdx === idx) UI().stopRest()
  else UI().shiftRestOwner(idx + 1, -1)
  update(s => {
    if (!s.active || !Array.isArray(s.active.entries)) return
    if (idx < 0 || idx >= s.active.entries.length) return
    s.active.entries.splice(idx, 1)
    cleanupSg(s.active.entries)
    if (idx < s.active.cur) s.active.cur--
    if (s.active.cur >= s.active.entries.length) s.active.cur = Math.max(0, s.active.entries.length - 1)
  }, true)
}
export function confirmRemoveExercise(idx) {
  const e = St().active && St().active.entries[idx]
  if (!e) return
  const hasDone = (e.sets || []).some(s => s.done)
  confirmSheet({
    title: t('Remove {0}?', exerciseNameText(exOr(e.id))),
    message: hasDone ? t('The sets you logged for this exercise in this session will be lost.') : t('This removes the exercise from your current session.'),
    confirmText: t('Remove'), danger: true,
    onConfirm: () => { bumpEpoch(); removeActiveExercise(idx) },
  })
}
// The bottom "Remove exercise": in a superset, which one first.
export function removeExerciseSheet() {
  const A = St().active
  if (!A) return
  const cur = curOf(A)
  const unit = unitOf(supersetUnits(A.entries), cur)
  if (unit.length > 1) {
    menuSheet({
      title: t('Remove exercise'),
      subtitle: t('Which exercise in this superset do you want to remove?'),
      items: unit.map(idx => ({ label: exerciseNameText(exOr(A.entries[idx].id)), chevron: true, onClick: () => confirmRemoveExercise(idx) })),
    })
  } else confirmRemoveExercise(cur)
}

/* ---------- fields ---------- */
const mutEntry = (idx, fn) => update(s => { fn(s.active.entries[idx]) }, true)
export const freshSet = (idx, i) => {
  const A = St().active
  return A && A.entries[idx] && A.entries[idx].sets[i]
}
export function setField(idx, i, field, v) {
  mutEntry(idx, e => {
    if (!e || !e.sets[i]) return
    if (v == null) delete e.sets[i][field]; else e.sets[i][field] = v
    if (field === 'sec') delete e.sets[i].planSec
    if (field === 'w') {
      e.sets[i].weightOrigin = WEIGHT_ORIGIN_MANUAL
      e.sets = cascadeWeight(e.sets, i, v, undefined, e.target && e.target.backoffStep)
    }
  })
}
export const mutSet = (idx, i, fn) => update(s => {
  const e = s.active && s.active.entries[idx]
  if (!e || !e.sets[i]) return
  e.sets[i] = fn(e.sets[i])
}, true)

export function setSide(idx, i, side, field, v) {
  if (field !== 'w') { mutSet(idx, i, row => setSideField(row, side, field, v)); return }
  update(s => {
    const e = s.active.entries[idx]
    const row = setSideField(e.sets[i], side, field, v)
    row.sides[side].weightOrigin = WEIGHT_ORIGIN_MANUAL
    e.sets[i] = row
    e.sets = cascadeWeight(e.sets, i, v, side, e.target && e.target.backoffStep)
  }, true)
}

export function addSet(idx) {
  mutEntry(idx, e => {
    const l = e.sets[e.sets.length - 1]
    const m = modeOf({ ...(e.target || {}), id: e.id })
    if (m === 'cardio') e.sets.push({ min: l ? l.min : (e.target.min || 20), speed: l ? l.speed : (e.target.speed || 8), ...inclineFrom(l), done: false })
    else if (m === 'time') {
      const sec = l ? l.sec : (e.target.sec || 45)
      const w = l ? (l.w || 0) : (e.target.weight || 0)
      if (isPerSide({ ...(e.target || {}), id: e.id })) e.sets.push({ sec, w, done: false, side: 'L' }, { sec, w, done: false, side: 'R' })
      else e.sets.push({ sec, w, done: false })
    } else {
      const row = { w: l ? l.w : 0, r: l ? l.r : e.target.reps, done: false, ...(l && l.max ? { max: true } : {}) }
      e.sets.push(isPerSide({ ...(e.target || {}), id: e.id })
        ? (l && isSideSet(l) ? makeSideSet({ w: l.sides.L.w, r: (l.sides.L.r || 0) * 2 }) : makeSideSet(row))
        : row)
    }
  })
}
export const removeSet = idx => mutEntry(idx, e => { e.sets = removeLastSet(e.sets) })
export function addWarmup(idx) {
  const S = St()
  mutEntry(idx, e => {
    const m = modeOf({ ...(e.target || {}), id: e.id })
    const ramp = (m === 'reps' && ownedWeightsFor(S, { ...(e.target || {}), id: e.id })) || defaultIncrement(e.id, S.unit)
    e.sets = insertWarmupRow(e.sets, m, e.target || {}, ramp, barFloor(S, e.id))
  })
}

/* ---------- drops, bursts, phase, failure ---------- */
const targetOf = idx => { const e = St().active.entries[idx]; return { entry: e, S: St() } }
export function addDropRow(idx, i) {
  const { entry, S } = targetOf(idx)
  const pct = entry.target && entry.target.intensifier && entry.target.intensifier.type === 'dropset' ? entry.target.intensifier.pct : undefined
  const grid = dropGrid(S, { ...entry.target, id: entry.id })
  mutSet(idx, i, row => {
    if (isSideSet(row)) return addSideDrop(row, pct, grid)
    const drops = dropsOf(row)
    const base = drops.length ? drops[drops.length - 1].w : (row.w || 0)
    return addDrop(row, { w: nextDropWeight(base, pct, grid), r: row.r })
  })
}
export function addBurstRow(idx, i) {
  const { entry, S } = targetOf(idx)
  const restSec = entry.target && entry.target.intensifier && entry.target.intensifier.type === 'restpause' ? entry.target.intensifier.restSec : (S.restPauseSec || 15)
  mutSet(idx, i, row => {
    if (isSideSet(row)) return addSideCluster(row, restSec)
    const clusters = clustersOf(row)
    const base = clusters.length ? clusters[clusters.length - 1].r : (row.r || 0)
    const added = nextBurstReps(base)
    return { ...addCluster(row, { r: added, restSec }), r: (row.r || 0) + added }
  })
}
export const removeDrop = (idx, i, di) => mutSet(idx, i, row => (isSideSet(row) ? removeSideDropAt(row, di) : removeDropAt(row, di)))
export const removeCluster = (idx, i, ci) => mutSet(idx, i, row => {
  if (isSideSet(row)) return removeSideClusterAt(row, ci)
  const removed = (clustersOf(row)[ci] && clustersOf(row)[ci].r) || 0
  return { ...removeClusterAt(row, ci), r: Math.max(0, (row.r || 0) - removed) }
})
export const setDropField = (idx, i, di, field, v, side) => mutSet(idx, i, row =>
  (isSideSet(row) ? setSideDropAt(row, side, di, { [field]: v }) : setDropAt(row, di, { [field]: v })))
export const setClusterField = (idx, i, ci, v, side) => mutSet(idx, i, row => {
  if (isSideSet(row)) return setSideClusterAt(row, side, ci, v)
  const delta = (Number(v) || 0) - ((clustersOf(row)[ci] && clustersOf(row)[ci].r) || 0)
  return { ...setClusterAt(row, ci, { r: v }), r: Math.max(0, (row.r || 0) + delta) }
})
export const setPhaseAt = (idx, i, warm) => update(s => {
  const e = s.active.entries[idx]
  e.sets = warm ? makeWarmupAt(e.sets, i) : makeWorkAt(e.sets, i)
}, true)
export const toggleFailureAt = (idx, i) => update(s => {
  const e = s.active.entries[idx]
  const [start, count] = setSpanAt(e.sets, i)
  const on = !isFailureSet(e.sets[i])
  for (let j = start; j < start + count; j++) if (isFailureSet(e.sets[j]) !== on) e.sets[j] = toggleFailure(e.sets[j])
}, true)

/* ---------- effort ---------- */
// Logging an effort concludes the set (#64): a pick ticks an open set; clearing never un-ticks.
export function openEffort(idx, i, kind, side) {
  const row = freshSet(idx, i)
  if (!row) return
  const f = kind === 'rpe' ? 'rpe' : 'rir'
  const src = side ? row.sides && row.sides[side] : row
  const v = src && src[f] != null ? src[f] : null
  effortPickerSheet(kind, v, nv => {
    if (side) setSide(idx, i, side, f, nv); else setField(idx, i, f, nv)
    if (nv == null) return
    const fresh = freshSet(idx, i)
    const done = side ? fresh && fresh.sides && fresh.sides[side] && fresh.sides[side].done : fresh && fresh.done
    if (fresh && !done) toggle(idx, i, side)
  })
}
export function stepEffortAt(idx, i, kind, dir, side) {
  const row = freshSet(idx, i)
  if (!row) return
  const f = kind === 'rpe' ? 'rpe' : 'rir'
  const src = side ? row.sides && row.sides[side] : row
  const v = src && src[f] != null ? src[f] : null
  const nv = stepEffort(kind, v, dir)
  if (side) setSide(idx, i, side, f, nv); else setField(idx, i, f, nv)
}

/* ---------- ticking a set ---------- */
export function toggle(idx, i, side, { quiet = false, onFocusProgress } = {}) {
  const S = St()
  const A = S.active
  if (!A || !A.entries[idx] || !A.entries[idx].sets[i]) return
  const editing = !!A.editingWorkoutId
  const units = supersetUnits(A.entries)
  const m = modeOf({ ...(A.entries[idx].target || {}), id: A.entries[idx].id })
  const cardioEntry = m === 'cardio'
  let exJustDone = false, workoutDone = false, checked = false
  update(s => {
    const e = s.active.entries[idx]
    if (side) e.sets[i] = toggleSide(e.sets[i], side)
    else e.sets[i].done = !e.sets[i].done
    checked = e.sets[i].done
    if (!editing && (side ? e.sets[i].sides[side].done : checked)) e.sets[i].at = Date.now()
    if (checked && e.sets[i].planSec != null) delete e.sets[i].planSec
    if (e.sets[i].done && !editing) {
      if (!quiet) { beep(S.sound, 1040, 0.12); vibrate(30) }
      const ownUnit = unitOf(units, idx)
      const unitDone = ownUnit.every(u => (u === idx ? e : A.entries[u]).sets.every(x => x.done))
      if (unitDone) workoutDone = !nextUnfinishedUnit(A.entries, supersetUnits(A.entries), idx)
      if (e.sets.every(x => x.done)) {
        exJustDone = true
        e.topW = bestWeightForEntry(e) || null
      }
    }
  }, true)
  if (editing) return
  if (workoutDone) openPage('/pkg-workout/complete/index', {})
  else if (exJustDone && cardioEntry) toast(t('Cardio logged'))
  else if (exJustDone && m === 'time') toast(t('Hold logged'))

  const fresh = St().active
  if (!(fresh && checked && fresh.entries[idx])) return
  const progress = setProgressHighWater(fresh.entries[idx], marks[idx] || 0)
  marks[idx] = progress.highWater
  const freshUnits = supersetUnits(fresh.entries)
  const freshUnit = freshUnits.find(u => u.includes(idx))
  const freshUnitDone = freshUnit && freshUnit.every(u => fresh.entries[u].sets.every(x => x.done))
  const nextUnit = freshUnitDone ? nextUnfinishedUnit(fresh.entries, freshUnits, idx) : null
  const freshWorkoutDone = freshUnitDone && !nextUnit
  const restBeforeWarmup = nextUnit && nextUnit.some(u => fresh.entries[u].sets.some(set => isWarmupRow(set) && !set.done))
  const setRest = { idx, sec: pyramidRestFor(fresh.entries[idx].target, fresh.entries[idx].sets, i) }
  const restSec = restSecFor(fresh.entries, freshUnit || [idx], S.restSec, setRest)
  const restAfter = warmupRestSecFor(fresh.entries[idx], i, restSec)

  if (!progress.isNew) {
    const rest = UI().timer
    if (!restBeforeWarmup && restOnRecheck({ timerRunning: !!(rest && !rest.ready), unitDone: freshUnitDone, lastUnit: freshWorkoutDone })) startRest(restAfter, idx, { forSet: i })
    return
  }
  if (collapseOnOf(St()) && freshUnitDone && nextUnit && freshUnit.includes(fresh.cur)) {
    update(s => { if (s.active) s.active.cur = nextUnit[0] })
    if (hooks.revealCur) hooks.revealCur()
  }
  const rows = fresh.entries[idx].sets
  const sideOf = r => (r && !isWarmupRow(r) ? r.side : null)
  const partner = sideOf(rows[i]) === 'L' && sideOf(rows[i + 1]) === 'R' ? rows[i + 1]
    : sideOf(rows[i]) === 'R' && sideOf(rows[i - 1]) === 'L' ? rows[i - 1] : null
  if (m === 'time' && partner && !partner.done && restAfter > 0) {
    startRest(Math.min(SWITCH_SIDES_SEC, restAfter), idx, { kind: 'switch', forSet: i })
    return
  }
  if (freshUnitDone) UI().stopRest()
  if (!freshUnit || freshUnit.length <= 1) {
    if (!restBeforeWarmup && restAfterSet({ unitDone: freshUnitDone, lastUnit: freshWorkoutDone })) startRest(restAfter, idx, { forSet: i })
    if (onFocusProgress) onFocusProgress({ unitDone: freshUnitDone })
    return
  }
  const step = supersetFlowStep(fresh.entries, freshUnit, idx)
  if (!step) { if (onFocusProgress) onFocusProgress({ unitDone: freshUnitDone }); return }
  if (step.unitDone) {
    if (nextUnit && nextUnit.length && !restBeforeWarmup) startRest(restAfter, idx, { forSet: i })
  } else {
    if (step.nextIdx != null) {
      update(s => { if (s.active) s.active.cur = step.nextIdx })
      if (hooks.onCurMoved) hooks.onCurMoved(step.nextIdx)
    }
    if (step.roundDone) startRest(restAfter, idx, { forSet: i })
  }
  if (onFocusProgress) onFocusProgress({ unitDone: freshUnitDone })
}

/* ---------- timed sets ---------- */
export function startTimed(idx, i, onFocusProgress) {
  const S = St()
  const A = S.active
  if (!A || A.editingWorkoutId) return
  const e = A.entries[idx]
  if (!e || !e.sets[i]) return
  unlock(S.sound)
  const plan = (!e.sets[i].done && e.sets[i].planSec) || e.sets[i].sec || 45
  const owner = { idx, i }
  UI().startWork(plan, exerciseNameText(exOr(e.id)), holdDone(owner, plan, onFocusProgress), { idx, i, id: e.id })
  holdAt = { owner, idx, i }
}
const holdDone = (owner, plan, onFocusProgress) => (elapsed, { abandoned = false, chimed = false } = {}) => {
  const { idx } = owner
  const mine = holdAt && holdAt.owner === owner
  const i = mine ? holdAt.i : owner.i
  if (mine) holdAt = null
  const A = St().active
  if (!A || !A.entries[idx] || !A.entries[idx].sets[i]) return
  if (abandoned) {
    mutEntry(idx, en => { if (en.sets[i].planSec == null && !en.sets[i].done) en.sets[i].planSec = plan; en.sets[i].sec = elapsed })
    return
  }
  mutEntry(idx, en => { en.sets[i].sec = elapsed; delete en.sets[i].planSec })
  if (!St().active.entries[idx].sets[i].done) toggle(idx, i, undefined, { quiet: chimed, onFocusProgress })
}
// A hold restored after a restart gets this screen's handler.
export function bindRestoredHold() {
  const ui = UI()
  if (!ui.bindWork) return
  ui.bindWork(wk => {
    const owner = { idx: wk.owner.idx, i: wk.owner.i }
    holdAt = { owner, idx: owner.idx, i: owner.i }
    return (...a) => holdDone(owner, wk.total)(...a)
  })
}

/* ---------- order, supersets, progression ---------- */
export function pairAt(first, second) {
  bumpEpoch()
  update(s => { s.active.entries = pairAdjacent(s.active.entries, first, second) })
}
export function unpairAt(idx) {
  bumpEpoch()
  update(s => { s.active.entries = unpairSuperset(s.active.entries, idx) })
}
export function moveUnitAt(at, direction, member = false) {
  const ui = UI()
  const active = St().active
  const canMove = member ? canMoveActiveWorkoutEntry : canMoveActiveWorkoutUnit
  if (ui.work || !canMove(active, at, direction)) return
  ui.stopWork()
  bumpEpoch()
  update(s => {
    const moved = (member ? moveActiveWorkoutEntry : moveActiveWorkoutUnit)(s.active, at, direction)
    if (!moved) return
    marks = moved.indices.map(index => marks[index])
    const rest = UI().timer
    if (rest && rest.forIdx != null) {
      const forIdx = moved.indices.indexOf(rest.forIdx)
      if (forIdx >= 0) useUI.setState({ timer: { ...rest, forIdx } })
    }
  }, true)
}
export const moveCurrentUnit = direction => { const A = St().active; if (A) moveUnitAt(curOf(A), direction) }

export const setNoProg = (idx, on) => update(s => setEntryNoProg(s.active, idx, on))
const routineKeepsOut = (S, e) => !!(e && e.rid) && S.routines.some(r => r.id === e.rid && r.excludeFromProgression === true)
export const noProgSwitchable = S => !S.active.entries.length || S.active.entries.some(e => !routineKeepsOut(S, e))
export function toggleSessionNoProg() {
  update(s => setSessionNoProg(s.active, !sessionNoProg(s.active), e => routineKeepsOut(s, e)))
}
export const canNoProg = (S, idx) => !routineKeepsOut(S, S.active.entries[idx])

const restWord = (S, v) => (Number(v) > 0 ? fmtRest(v) : t('Default ({0})', fmtRest(S.restSec)))
export function routineUpdateFor(S, idx) {
  const A = S.active
  const entry = A.entries[idx]
  const routine = !A.editingWorkoutId && entry && entry.rid ? S.routines.find(r => r.id === entry.rid) : null
  const found = routine ? routineChangesFromEntry(routine, A.entries, idx) : null
  if (!found) return null
  const activeId = A.id
  const entryId = entry.id
  return {
    sub: found.changes.map(c => c.key === 'note' ? t('Note')
      : c.key === 'warmupSets' ? t('Warm-up sets') + ' ' + c.from + ' → ' + c.to
        : t('Rest') + ' ' + restWord(S, c.from) + ' → ' + restWord(S, c.to)).join(' · '),
    run: () => confirmSheet({
      title: t('Update “{0}”?', routine.name),
      message: t('Copy this exercise’s warm-up sets, and the rest and note from its Exercise settings, into the routine. A note added for today stays with this workout. Your workout history is kept.'),
      confirmText: t('Update routine'),
      onConfirm: () => {
        let applied = null
        update(s => {
          const target = s.routines.find(r => r.id === routine.id)
          if (!target || !s.active || s.active.id !== activeId || !s.active.entries[idx] || s.active.entries[idx].id !== entryId) return
          applied = updateRoutineFromEntry(target, s.active.entries, idx)
        })
        if (applied) toast(t('Routine updated'))
      },
    }),
  }
}

export function openExerciseRest(idx) {
  const state = St()
  const entry = state.active && state.active.entries[idx]
  if (!entry) return
  const activeId = state.active.id
  const entryId = entry.id
  durationSheet({
    title: t('Rest for this exercise'),
    value: entry.target && entry.target.restSec > 0 ? entry.target.restSec : 0, max: REST_MAX,
    off: t('Default ({0})', fmtRest(state.restSec)),
    footer: t('Rest after each set of this exercise. 0:00 means your default rest.'),
    onDone: v => update(s => {
      const e = s.active && s.active.id === activeId ? s.active.entries[idx] : null
      if (!e || e.id !== entryId) return
      e.target = { ...(e.target || {}), restSec: v }
    }),
  })
}

export function openProgressionSettings(idx) {
  const state = St()
  const entry = state.active && state.active.entries[idx]
  if (!entry) return
  const activeId = state.active.id
  const entryId = entry.id
  const entryCount = state.active.entries.length
  const routine = state.routines.find(r => r.id === entry.rid)
  const opened = plannedConfigOf(entry)
  exConfigSheet(exOr(entryId), opened, cfg => {
    const current = St()
    if (!current.active || current.active.id !== activeId || current.active.entries.length !== entryCount || !current.active.entries[idx] || current.active.entries[idx].id !== entryId) return
    update(s => {
      const activeEntry = s.active && s.active.id === activeId ? s.active.entries[idx] : null
      if (!activeEntry || activeEntry.id !== entryId) return
      const full = { ...cfg, id: activeEntry.id }
      if ((cfg.weight || 0) === (opened.weight || 0) && activeEntry.planned && activeEntry.planned.weight != null) full.weight = activeEntry.planned.weight
      const activeRoutine = s.routines.find(r => r.id === activeEntry.rid)
      if (!(full.sets > 0)) full.sets = activeEntry.sets.filter(x => !isWarmupRow(x)).length || 1
      const built = buildPlannedEntry(sessionHistory(s), full, activeRoutine, { noProg: builtOutOfProgression(activeEntry, activeRoutine) })
      const fresh = built.sets
      const doneWarm = activeEntry.sets.filter(x => x.done && isWarmupRow(x))
      const doneWork = activeEntry.sets.filter(x => x.done && !isWarmupRow(x))
      const freshWarm = fresh.filter(isWarmupRow)
      const freshWork = fresh.filter(x => !isWarmupRow(x))
      activeEntry.target = built.target
      activeEntry.plan = built.plan
      activeEntry.planned = built.planned
      if (built.carried) activeEntry.carried = true
      else delete activeEntry.carried
      activeEntry.sets = [...doneWarm, ...freshWarm.slice(doneWarm.length), ...doneWork, ...freshWork.slice(doneWork.length)]
    })
  }, null, routine)
}

export function swapExercise(idx) { bumpEpoch(); swapActiveWorkoutExercise(idx) }

export function addExercise() {
  exercisePicker((ex, quick) => {
    const S = St()
    const A = S.active
    if (!A) return
    const curEntry = A.entries[A.cur]
    const curRid = curEntry && curEntry.rid
    const routine = curRid ? S.routines.find(r => r.id === curRid) : null
    const freestyle = !routine
    const noProg = !freestyle && builtOutOfProgression(curEntry, routine)
    const seed = freestyle ? freestyleConfig(sessionHistory(S), { id: ex.id, ...defaultConfig(ex.id) }) : null
    const commit = cfg => {
      bumpEpoch()
      update(s => {
        if (!s.active) return
        const full = { ...cfg, id: ex.id }
        const past = sessionHistory(s)
        const built = freestyle
          ? {
            target: withMeaning(s, cfg, ex.id), plan: null,
            sets: applyIntensifierPlan(buildSets(historyAs(past, ex.id, dbLoadFor(s, full)), full, {
              step: modeOf(full) === 'reps' ? (ownedWeightsFor(s, full) || weightIncrement(full, s.unit)) : defaultIncrement(ex.id, s.unit), preferLast: true,
            }), full, dropGrid(s, full)),
          }
          : buildPlannedEntry(past, full, routine, { noProg })
        const insertAt = insertionIndexAfterCurrentUnit(supersetUnits(s.active.entries), s.active.cur, s.active.entries.length)
        s.active.entries.splice(insertAt, 0, joinSessionNoProg(s.active, { id: ex.id, ...built, ...(curRid ? { rid: curRid } : {}), ...(noProg ? { noProg: true } : {}) }))
        s.active.cur = insertAt
        UI().shiftRestOwner(insertAt, 1)
      })
    }
    if (quick) { commit(seed || defaultConfig(ex.id)); toast(t('“{0}” added to {1}', exerciseNameText(ex), routine ? routine.name : t('Freestyle'))) }
    else exConfigSheet(ex, null, commit, null, routine, seed, null, t('Add to this workout'))
  })
}

/* ---------- navigation between units ---------- */
export function navigateUnit(direction) {
  const targetFor = active => {
    if (!active || !Array.isArray(active.entries) || !Number.isInteger(active.cur)) return null
    if (active.cur < 0 || active.cur >= active.entries.length) return null
    const units = supersetUnits(active.entries)
    const k = units.findIndex(c => c.includes(active.cur))
    const u = k < 0 ? null : units[k + direction]
    return u ? u[0] : null
  }
  if (targetFor(St().active) == null) return
  update(s => { const tg = targetFor(s.active); if (tg != null) s.active.cur = tg })
}
// List mode's "Set current" (#260): back to Cards when the list was only this session's.
export const focusUnit = firstIdx => update(s => {
  if (!s.active) return
  s.active.cur = firstIdx
  if (!workoutControls(s).exerciseButtons && (s.workoutView || 'cards') === 'cards') s.active.workoutView = 'cards'
})
export const selectEntry = idx => update(s => { if (s.active) s.active.cur = idx })
export const advanceFocusUnit = () => update(s => {
  if (!s.active) return
  const next = nextUnfinishedUnit(s.active.entries, supersetUnits(s.active.entries), s.active.cur)
  if (next) s.active.cur = next[0]
})

/* ---------- header menus ---------- */
const setWorkoutView = v => update(s => { if (s.active) s.active.workoutView = v })
const LAYOUT_LABEL = () => ({ cards: t('Cards'), list: t('List'), compact: t('Compact'), focus: t('Focus') })
export function openLayoutMenu() {
  const S = St()
  const { view, listMode } = viewOf(S)
  const collapseOn = collapseOnOf(S)
  menuSheet({
    title: t('Layout'),
    items: [
      { icon: 'layout', label: t('Cards'), on: view === 'cards', onClick: () => setWorkoutView('cards') },
      { icon: 'list', label: t('List'), on: view === 'list', onClick: () => setWorkoutView('list') },
      { icon: 'compact', label: t('Compact'), on: view === 'compact', onClick: () => setWorkoutView('compact') },
      { icon: 'target', label: t('Focus'), on: view === 'focus', onClick: () => setWorkoutView('focus') },
      listMode && {
        icon: 'minimize', label: t('Collapse completed exercises'), sub: t('Keep the current exercise open'), on: collapseOn,
        onClick: () => update(s => { if (s.active) s.active.collapseCompleted = !collapseOn }),
      },
    ],
  })
}
// Logging a past workout (#284): one tap ticks them all and offers the finish.
export function markAllDone() {
  update(s => { if (s.active) s.active.entries = markAllSetsDone(s.active.entries) }, true)
  const fresh = St().active
  if (fresh) marks = marksOf(fresh)
  openPage('/pkg-workout/complete/index', {})
}
export function openViewMenu() {
  const S = St()
  const A = S.active
  if (!A) return
  const editing = !!A.editingWorkoutId
  const { view } = viewOf(S)
  menuSheet({
    sections: [
      { items: [{
        icon: 'gear', accent: true, chevron: true, label: t('Workout settings'),
        sub: [S.restSec > 0 ? t('{0} rest', fmtRest(S.restSec)) : t('No rest timer'), S.sound ? t('Sound') : t('Silent')].join(' · '),
        onClick: workoutSettingsSheet,
      }] },
      { title: t('Add'), items: [
        { icon: 'plusCircle', label: t('Add exercise'), onClick: addExercise },
        !editing && { icon: 'clipboard', label: t('Add routine'), sub: t('Bring another routine into this session'), onClick: () => { if (St().active) addRoutineToSessionSheet() } },
      ] },
      { title: t('This workout'), items: [
        A.backfill && A.entries.length > 0 && { icon: 'checkCircle', label: t('Mark all sets done'), onClick: markAllDone },
        { icon: 'pencil', label: t('Rename workout'), onClick: renameWorkoutSheet },
        { icon: 'layout', label: t('Layout'), sub: LAYOUT_LABEL()[view] || LAYOUT_LABEL().cards, onClick: openLayoutMenu },
        { icon: 'note', label: A.note ? t('Edit session note') : t('Add session note'), onClick: sessionNoteSheet },
        noProgSwitchable(S) && { icon: 'chartLineSlash', label: t('Don’t count for progression'), sub: t('Every exercise in this workout'), on: sessionNoProg(A), onClick: toggleSessionNoProg },
      ] },
      { items: [!editing && { icon: 'trash', label: t('Discard workout'), danger: true, onClick: discardWithConfirm }] },
    ],
  })
}

/* ---------- an exercise's ⋯ menu and a set's menu ---------- */
// `ctx` is the block's blockModel ctx; `pairable` whether this block offers the superset pairing.
export function openMore(idx, ctx, { pairable = false } = {}) {
  const S = St()
  const A = S.active
  const entry = A && A.entries[idx]
  if (!entry || !ctx) return
  const editing = !!A.editingWorkoutId
  const ex = exOr(entry.id)
  const busy = !!UI().work
  const last = ctx.last
  const guidance = progressionGuidance(entry.plan)
  const ru = routineUpdateFor(S, idx)
  const onNoProg = canNoProg(S, idx)
  const isSuperset = unitOf(supersetUnits(A.entries), idx).length > 1
  const pairPrev = pairable && !isSuperset && idx > 0
  const pairNext = pairable && !isSuperset && idx < A.entries.length - 1
  menuSheet({
    title: exerciseNameFor(ex),
    sections: [
      { title: t('Today'), items: [
        { icon: 'swap', label: t('Swap exercise'), onClick: () => swapExercise(idx), disabled: busy },
        { icon: 'sunrise', label: t('Add warm-up set'), onClick: () => addWarmup(idx) },
        { icon: 'note', label: entry.note ? t('Edit note') : t('Add note'), sub: entry.note || undefined, onClick: () => exerciseNoteSheet(idx) },
        onNoProg && { icon: 'chartLineSlash', label: t('Don’t count for progression'), sub: t('This exercise, this session only'), on: entry.noProg === true, onClick: () => setNoProg(idx, entry.noProg !== true) },
      ] },
      { title: t('Look it up'), items: [
        { icon: 'history', label: t('History'), sub: last ? t('Last time') + ' ' + fmtDate(last.d) : undefined, onClick: () => exerciseHistorySheet(entry.id) },
        { icon: 'info', label: t('How to do it'), onClick: () => exerciseDetailSheet(ex) },
      ] },
      { title: t('Settings'), items: [
        !editing && { icon: 'slider', label: t('Exercise settings'), sub: guidance ? t(guidance.policyLabel) : t('Sets, reps, rest, progression'), onClick: () => openProgressionSettings(idx) },
        !editing && { icon: 'timer', label: t('Rest timer'), sub: restSubOf(S, entry), onClick: () => openExerciseRest(idx) },
        ctx.plateLoading && { icon: 'plate', label: t('Plate loading'), sub: loadSummaryOf(S, ctx), onClick: () => barWeightSheet(entry.id, ctx.cfg) },
        ru && { icon: 'clipboard', label: t('Update routine'), sub: ru.sub, onClick: ru.run },
      ] },
      { title: t('Order and supersets'), items: [
        pairPrev && { icon: 'link', label: t('Make superset with previous'), onClick: () => pairAt(idx - 1, idx) },
        pairNext && { icon: 'link', label: t('Make superset with next'), onClick: () => pairAt(idx, idx + 1) },
        { icon: 'chevronUp', label: t('Move up'), onClick: () => moveUnitAt(idx, -1, true), disabled: busy || !canMoveActiveWorkoutEntry(A, idx, -1) },
        { icon: 'chevronDown', label: t('Move down'), onClick: () => moveUnitAt(idx, 1, true), disabled: busy || !canMoveActiveWorkoutEntry(A, idx, 1) },
      ] },
      { items: [
        { icon: 'trash', label: t('Remove exercise'), onClick: () => confirmRemoveExercise(idx), danger: true, disabled: busy },
      ] },
    ],
  })
}

export function openSetMenu(idx, i) {
  const S = St()
  const A = S.active
  const entry = A && A.entries[idx]
  const s = entry && entry.sets[i]
  if (!s) return
  const editing = !!A.editingWorkoutId
  const mode = modeOf({ ...(entry.target || {}), id: entry.id })
  const perSide = mode === 'reps' && isPerSide({ ...(entry.target || {}), id: entry.id })
  const warm = isWarmupRow(s)
  const sideTag = s.side === 'L' ? t('Left') : s.side === 'R' ? t('Right') : null
  const num = setNumberAt(entry.sets, i)
  menuSheet({
    title: warm ? t('Warm-up') : sideTag ? t('Set {0} ({1})', num, sideTag) : t('Set {0}', num),
    subtitle: setLabel(entry.id, s, entry.target, speedUnitOf(S)),
    sections: [
      { items: [
        !warm && mode === 'reps' && canBeWarmup(s) && entry.sets.some((x, j) => j !== i && !isWarmupRow(x)) && { icon: 'sunrise', label: t('Make it a warm-up set'), onClick: () => setPhaseAt(idx, i, true) },
        warm && mode === 'reps' && !perSide && { icon: 'dumbbell', label: t('Count it as a working set'), onClick: () => setPhaseAt(idx, i, false) },
        !warm && mode !== 'cardio' && { icon: 'gauge', label: t('Taken to failure'), sub: t('Nothing left in the tank'), on: isFailureSet(s), onClick: () => toggleFailureAt(idx, i) },
      ] },
      { title: t('Add to this set'), items: [
        !warm && mode === 'reps' && !isRestPauseSet(s) && { icon: 'arrowDown', label: t('Drop set'), sub: t('+ Drop'), onClick: () => addDropRow(idx, i) },
        !warm && mode === 'reps' && !isDropSet(s) && { icon: 'bolt', label: t('Rest-pause burst'), sub: t('+ Burst'), onClick: () => addBurstRow(idx, i) },
      ] },
      { items: [
        { icon: 'copy', label: t('Copy this set'), onClick: () => copyActiveSet(idx, i) },
        { icon: 'trash', label: t('Remove this set'), danger: true, disabled: !editing && entry.sets.length <= setSpanAt(entry.sets, i)[1], onClick: () => removeSetAt(idx, i) },
      ] },
    ],
  })
}

/* ---------- the one-time swipe hint (v1.3.11) ---------- */
let hintTm = null
export function maybeSwipeHint() {
  const S = St()
  const A = S.active
  if (!A || !workoutControls(S).swipeSets || (S.hints && S.hints.swipeSets) || !A.entries.length) return
  const c = curOf(A)
  const { listMode } = viewOf(S)
  const order = listMode ? [c, ...A.entries.keys()] : unitOf(supersetUnits(A.entries), c)
  let at = null
  for (const k of order) {
    const j = A.entries[k] ? A.entries[k].sets.findIndex(x => !x.done) : -1
    if (j >= 0) { at = { idx: k, i: j }; break }
  }
  if (!at) return
  update(s => { s.hints = { ...(s.hints || {}), swipeSets: true } })
  const id = Date.now()
  setUI({ swipeHint: { ...at, id } })
  clearTimeout(hintTm)
  hintTm = setTimeout(() => { if (UI().swipeHint && UI().swipeHint.id === id) setUI({ swipeHint: null }) }, 6000)
}
export function clearRowUI() {
  clearTimeout(hintTm)
  setUI({ swipeHint: null, setFlash: null })
}
export const dismissHint = () => { if (UI().swipeHint) setUI({ swipeHint: null }) }

// A horizontal swipe on a set row just handled: the card swipe of the same gesture stays put.
export const swipeGuard = { at: 0 }
