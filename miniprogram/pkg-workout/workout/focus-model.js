// The small rules frontend/src/views/FocusView.jsx kept inline (one set at a time, the Focus
// layout), moved here so they are testable: which set the view opens at, the order a superset's
// sets are walked in, the set menu's warm-up/drop/burst edits, and the badges above the set.
import { fmtNum, fmtPlate } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { setsRepsOf, modeOf } from '../../lib/history.js'
import { rowLoad, loadKindFor, baseWeightFor, inventoryFor } from '../../lib/plates.js'
import {
  addCluster, addDrop, addSideCluster, addSideDrop, clustersOf, dropsOf, isSideSet, isWarmupRow,
  nextBurstReps, nextDropWeight,
} from '../../lib/workout-model.js'

export const firstIncomplete = entry => {
  const index = entry.sets.findIndex(set => !set.done)
  return index < 0 ? Math.max(0, entry.sets.length - 1) : index
}

export const clampSet = (entry, index) => Math.min(Math.max(index, 0), Math.max(0, entry.sets.length - 1))

// A superset's sets round by round: A1 B1 A2 B2 …
export const supersetSequence = (entries, unit) => {
  const rounds = Math.max(0, ...unit.map(index => (entries[index] && entries[index].sets ? entries[index].sets.length : 0)))
  const out = []
  for (let setIdx = 0; setIdx < rounds; setIdx++) {
    unit.forEach(entryIdx => { if (entries[entryIdx] && entries[entryIdx].sets && entries[entryIdx].sets[setIdx]) out.push({ entryIdx, setIdx }) })
  }
  return out
}

export const toggleWarmup = row => {
  const next = { ...row }
  if (isWarmupRow(next)) {
    delete next.phase
    delete next.warmup
  } else {
    next.phase = 'warmup'
    delete next.failure
  }
  return next
}

export const addDropTo = (row, target) => {
  const pct = target && target.intensifier ? target.intensifier.pct : undefined
  if (isSideSet(row)) return addSideDrop(row, pct)
  const drops = dropsOf(row).length ? dropsOf(row) : row.drops || []
  const lastW = drops.length ? drops[drops.length - 1].w : null
  const base = lastW != null ? lastW : (row.w != null ? row.w : 0)
  return addDrop(row, { w: nextDropWeight(base, pct), r: row.r || 0 })
}

export const addBurstTo = (row, restSec) => {
  if (isSideSet(row)) return addSideCluster(row, restSec)
  const clusters = clustersOf(row).length ? clustersOf(row) : row.clusters || []
  const lastR = clusters.length ? clusters[clusters.length - 1].r : null
  const reps = nextBurstReps(lastR != null ? lastR : (row.r != null ? row.r : 0))
  return { ...addCluster(row, { r: reps, restSec }), r: (row.r || 0) + reps }
}

// The row of badges over the set (Prescription): "2/4", the target reps, load, RPE, rest, tempo.
export function prescriptionBadges(entry, setIdx, unit, fallbackRest) {
  const target = entry.target || {}
  const reps = target.repsMin > 0 ? target.repsMin + '–' + target.reps : target.reps > 0 ? String(target.reps) : ''
  const load = target.weight > 0
    ? '@ ' + fmtNum(target.weight) + (target.weightMax > target.weight ? '–' + fmtNum(target.weightMax) : '') + ' ' + unit
    : ''
  const rpe = target.rpeMin > 0 ? 'RPE ' + fmtNum(target.rpeMin) + (target.rpeMax > target.rpeMin ? '–' + fmtNum(target.rpeMax) : '') : ''
  const rest = target.restSec > 0 ? t('Rest') + ' ' + target.restSec + 's' : fallbackRest > 0 ? t('Rest') + ' ' + fallbackRest + 's' : ''
  return {
    progress: (setIdx + 1) + '/' + entry.sets.length,
    badges: [reps && reps + ' ' + t('Reps'), load, rpe, rest, target.tempo].filter(Boolean),
  }
}

// PlanBadge: the plan line when today's rows are not the plan's, or "reps from your last session".
export function planBadge(entry, mode) {
  const planned = entry.planned && mode !== 'cardio' ? entry.planned : null
  if (!planned) return ''
  const today = entry.target || {}
  const todaySets = today.sets || planned.sets || 1
  const inPlan = mode === 'time'
    ? today.sec == null || today.sec === planned.sec
    : today.reps == null || (planned.repsMin > 0 ? today.reps >= planned.repsMin && today.reps <= planned.reps : today.reps === planned.reps)
  if (todaySets === (planned.sets || 1) && inPlan) return entry.carried ? t('reps from your last session') : ''
  return t('Plan: {0}', setsRepsOf({ ...planned, mode }))
}

// PlateBadge: the plates for this set's weight, or null.
export function plateBadge(S, entry, set) {
  const cfg = { ...(entry.target || {}), id: entry.id }
  if (modeOf(cfg) !== 'reps') return null
  const load = rowLoad(loadKindFor(S, cfg), set.w, baseWeightFor(S, entry.id), inventoryFor(S))
  if (!load) return null
  const stack = load.plates.map(fmtPlate).join(' + ')
  const text = load.barOnly ? t('Bar only') : load.kind === 'pairs' ? t('{0} per side', stack || '–') : t('Load {0}', stack || '–')
  return { text, short: load.missing > 0 ? t('{0} short', fmtPlate(load.missing) + ' ' + S.unit) : '' }
}
