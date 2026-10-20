// What one exercise block of the workout screen shows (frontend/src/views/Workout.jsx
// ExerciseBlock), as plain data for WXML: every string formatted, every condition a boolean.
// `blockModel(S, idx, opts)` returns { vm, ctx }: `vm` goes into setData, `ctx` keeps what the
// handlers need and WXML cannot carry (the columns with their view/store conversions, the
// dumbbell stepping rule).
//
// No business rule lives here: every decision is a call into lib (history, plates, pyramid,
// progression-copy, workout-model…), the same calls the original made while rendering.
import { exOr, betterWeight } from '../../lib/exercises.js'
import { usesBar } from '../../lib/bar.js'
import { loadKindFor, baseWeightFor, inventoryFor, rowLoad, sameLoad, plateDelta } from '../../lib/plates.js'
import {
  lastEntryFor, bestWeightFor, setLabel, modeOf, isBw, isPerSide, repStep, EFFORT, effortOf,
  setSpanAt, pinnedNoteFor, exNoteFor, setsRepsOf,
} from '../../lib/history.js'
import { fmtNum, fmtPlate, fmtDate, fmtDaysAgo, todayISO, exerciseNameText } from '../../lib/format.js'
import { speedUnitOf, toSpeed, fromSpeed } from '../../lib/speed.js'
import { clampIncline, hasIncline, inclineFits, INCLINE_STEP } from '../../lib/incline.js'
import { t, tn, exerciseNameFor, exerciseNameClass } from '../../lib/i18n.js'
import { maxRecordAt, isPyramid, pyramidLabel } from '../../lib/pyramid.js'
import { effortColor } from '../../lib/effort.js'
import { weightIncrement, stepWeight } from '../../lib/progression.js'
import { progressionGuidance } from '../lib/progression-copy.js'
import { sessionHistory } from '../../lib/backfill.js'
import { bestSetFor } from '../../lib/exercise-history.js'
import { isWarmupRow, isFailureSet, isDropSet, isRestPauseSet, dropsOf, clustersOf, isSideSet } from '../../lib/workout-model.js'
import { MUSCLE_NAME } from '../../lib/muscles.js'
import { workoutControls } from '../../lib/workout-controls.js'
import { entryDbLoad, bellsIn, ownedWeightsFor, stepOwned } from '../../lib/dumbbells.js'
import { fmtRest } from '../../lib/duration.js'

// The history a session is built from, once per state object: every block of one render reads
// the same S, and sessionHistory of a past session filters the whole workout list.
let hCache = { S: null, H: null }
export function historyOf(S) {
  if (hCache.S !== S) hCache = { S, H: sessionHistory(S) }
  return hCache.H
}

/** The number a set row shows: counted per phase (warm-ups and work sets each from 1), and a
 *  timed per-side L/R pair as one set. (Workout.jsx setNumberAt) */
export function setNumberAt(sets, i) {
  const s = sets[i]
  const warm = isWarmupRow(s)
  const phaseNum = sets.slice(0, i + 1).filter(x => isWarmupRow(x) === warm).length
  return s && s.side ? Math.ceil(phaseNum / 2) : phaseNum
}

// A set-row column's number as it is shown (cardio speed is stored in km/h).
export const viewOf = (col, value) => (col.view && value != null && value !== '' ? col.view(value) : value)

const effStyle = color => (color ? 'color:' + color + ';border-color:' + color : '')

/** The columns of an entry's rows, with the stepping rules. Shared by the block and Focus. */
export function columnsOf(S, entry) {
  const ex = exOr(entry.id)
  const cfg = { ...(entry.target || {}), id: entry.id }
  const mode = modeOf(cfg)
  const cardio = mode === 'cardio'
  const timed = mode === 'time'
  const bw = !cardio && isBw(cfg)
  const perSide = mode === 'reps' && isPerSide(cfg)
  const loadStep = mode === 'reps' ? weightIncrement(cfg, S.unit) : 2.5
  const owned = mode === 'reps' ? ownedWeightsFor(S, cfg) : null
  const stepLoad = (v, step, dir) => (owned ? stepOwned(owned, v, dir) : stepWeight(v, step, dir))
  const meaning = entryDbLoad(entry)
  const bells = !bw && bellsIn(cfg) === 2 ? meaning : 'as'
  const loadCol = {
    f: 'w', step: loadStep, dec: true, load: true,
    hd: bw ? t('Added ({0})', S.unit) : bells === 'each' ? t('Each ({0})', S.unit) : bells === 'total' ? t('Both ({0})', S.unit) : t('Weight ({0})', S.unit),
  }
  const repCol = { f: 'r', step: repStep(cfg), dec: false, hd: t('Reps') }
  const col1 = cardio ? { f: 'min', step: 1, dec: false, hd: t('Duration (min)') }
    : timed ? { f: 'sec', step: 5, dec: false, hd: t('Seconds') }
      : loadCol
  const speedUnit = speedUnitOf(S)
  const col2 = cardio ? {
    f: 'speed', step: 0.5, dec: true, hd: speedUnit === 'mph' ? t('Speed (mph)') : t('Speed (km/h)'),
    view: v => toSpeed(v, speedUnit), store: v => fromSpeed(v, speedUnit),
  } : timed ? loadCol : repCol
  const kind = effortOf(S)
  const eff = EFFORT[kind]
  const inclineCol = cardio && (inclineFits(ex) || entry.sets.some(hasIncline))
    ? { f: 'incline', step: INCLINE_STEP, dec: true, opt: true, hd: t('Incline (%)'), store: clampIncline } : null
  const col3 = cardio ? inclineCol : mode === 'reps' && eff ? { f: eff.f, eff: kind, hd: t(eff.hd) } : null
  return { ex, cfg, mode, cardio, timed, bw, perSide, loadStep, owned, stepLoad, meaning, col1, col2, col3, speedUnit, effKind: kind }
}

// One cell's data: a number field (stepper) or the effort button.
function cellVM(col, s) {
  if (!col) return null
  if (col.eff) {
    const v = s[col.f] == null ? null : s[col.f]
    const rir = col.eff === 'rpe' ? (v == null ? null : 10 - v) : v
    return { eff: true, empty: v == null, hd: col.hd, v: v == null ? '' : fmtNum(v), style: effStyle(effortColor(rir)) }
  }
  const raw = viewOf(col, s[col.f])
  return { eff: false, f: col.f, v: raw == null || raw === '' ? null : raw, dec: !!col.dec, opt: !!col.opt }
}

/**
 * The block for active entry `idx`. opts: { compact, dense, pairable, ui } — `ui` the UI store
 * state (swipe hint, row flash, running hold).
 */
export function blockModel(S, idx, { compact = false, dense = false, pairable = false, ui = {} } = {}) {
  const A = S.active
  const entry = A && A.entries[idx]
  if (!entry) return { vm: null, ctx: null }
  const editing = !!A.editingWorkoutId
  const c = columnsOf(S, entry)
  const { ex, cfg, mode, cardio, timed, perSide, meaning, col1, col2, col3, speedUnit } = c
  const H = historyOf(S)
  const last = lastEntryFor(H, entry.id, entry.rid)
  const standingNote = exNoteFor(S, entry.id)
  const pinned = entry.sets.some(s => !s.done) ? pinnedNoteFor(S, entry.id) : null
  const bestHist = bestWeightFor(H, entry.id, meaning)
  const bestKept = ((H.exWeights || {})[entry.id] || {}).w || 0
  const best = cardio ? 0 : bestHist > 0 && bestKept > 0 ? betterWeight(entry.id, bestHist, bestKept) : Math.max(bestHist, bestKept)
  const plan = entry.plan
  const guidance = progressionGuidance(plan)
  const wc = workoutControls(S)

  // The plan this exercise was built from (#275).
  const planned = entry.planned && mode !== 'cardio' ? entry.planned : null
  let planLine = ''
  if (planned) {
    const today = entry.target || {}
    if (isPyramid(today)) planLine = t('Plan: {0}', pyramidLabel(today.pyramid))
    else {
      const todaySets = today.sets || planned.sets || 1
      const inPlan = timed
        ? today.sec == null || today.sec === planned.sec
        : today.reps == null || (planned.repsMin > 0 ? today.reps >= planned.repsMin && today.reps <= planned.reps : today.reps === planned.reps)
      const note = todaySets !== (planned.sets || 1) || !inPlan
        ? t('today {0}', setsRepsOf({ mode, sets: todaySets, reps: today.reps, sec: today.sec }))
        : entry.carried ? t('reps from your last session') : null
      planLine = t('Plan: {0}', setsRepsOf({ ...planned, mode })) + (note ? ' · ' + note : '')
    }
  }

  // "Last time" or the best set (#173), switched by a tap (S.logRef).
  const refBest = S.logRef === 'best'
  const ref = refBest ? bestSetFor(H, entry.id, mode, meaning) : last
  const refLabel = refBest ? t('Best set') : t('Last time')
  let refText = ''
  if (ref) {
    const refSets = (refBest ? [ref.set] : ref.sets).map(s => setLabel(entry.id, s, ref.target, speedUnit))
    refText = refLabel + ' (' + fmtDaysAgo(ref.d, A.d || todayISO()) + '): ' + refSets.join(', ')
  } else if (refBest && last) refText = t('Best set: nothing logged this way yet')

  // Plate loading per row (lib/plates.js).
  const plateLoading = mode === 'reps' && !editing
  const loadKind = plateLoading ? loadKindFor(S, cfg) : 'none'
  const base = baseWeightFor(S, entry.id)
  const loadSeq = []
  if (loadKind !== 'none') {
    const inv = inventoryFor(S)
    entry.sets.forEach((s, i) => {
      let w = s.w
      if (perSide && isSideSet(s)) {
        const L = (s.sides.L && s.sides.L.w) || 0, R = (s.sides.R && s.sides.R.w) || 0
        if (L && R && L !== R) return
        w = L || R
      }
      loadSeq.push({ key: String(i), load: rowLoad(loadKind, w, base, inv) })
      dropsOf(s).forEach((d, di) => loadSeq.push({ key: i + ':d' + di, load: rowLoad(loadKind, d.w, base, inv) }))
    })
  }
  const loadLine = key => {
    const at = loadSeq.findIndex(x => x.key === key)
    const L = at >= 0 ? loadSeq[at].load : null
    if (!L) return null
    let p = at - 1
    while (p >= 0 && !loadSeq[p].load) p--
    const prev = p >= 0 ? loadSeq[p].load : null
    if (prev && sameLoad(prev, L)) return null
    const stack = L.plates.map(w => fmtPlate(w)).join(' + ')
    const text = L.barOnly ? t('Bar only') : L.kind === 'pairs' ? t('{0} per side', stack || '–') : t('Load {0}', stack || '–')
    const d = prev && !dense ? plateDelta(prev.plates, L.plates) : null
    const moves = d ? [...d.strip.map(w => '−' + fmtPlate(w)), ...d.add.map(w => '+' + fmtPlate(w))] : []
    return { text, short: L.missing > 0 ? t('{0} short', fmtPlate(L.missing) + ' ' + S.unit) : '', moves: moves.join(' ') }
  }

  const sideTagOf = s => (s.side === 'L' ? t('Left') : s.side === 'R' ? t('Right') : '')
  const work = ui.work
  const plainRow = (s, i) => ({
    i,
    done: !!s.done,
    num: setNumberAt(entry.sets, i),
    fail: isFailureSet(s),
    sideTag: sideTagOf(s),
    c1: cellVM(col1, s),
    c2: cellVM(col2, s),
    c3: col3 ? (col3.eff ? cellVM(col3, s) : cellVM(col3, s)) : null,
    c3inc: !!(col3 && !col3.eff),
    go: timed && !editing,
    goDis: !!s.done || !!work,
  })
  const sideRowVM = (s, i, side) => {
    const sd = (s.sides && s.sides[side]) || { w: 0, r: 0, done: false }
    return {
      side,
      tag: side === 'L' ? t('L') : t('R'),
      done: !!sd.done,
      c1: cellVM(col1, sd),
      c2: cellVM(col2, sd),
      c3: col3 ? cellVM(col3, sd) : null,
      drops: dropsOf(sd).map((d, di) => ({ di, label: t('Drop {0}', di + 1), w: d.w == null ? null : d.w, r: d.r == null ? null : d.r })),
      bursts: clustersOf(sd).map((b, ci) => ({ ci, label: t('Burst {0}', ci + 1), r: b.r == null ? null : b.r, rest: b.restSec + 's' })),
    }
  }

  const hint = ui.swipeHint && ui.swipeHint.idx === idx ? ui.swipeHint : null
  const flash = ui.setFlash && ui.setFlash.idx === idx ? ui.setFlash : null
  const swipeOn = !!wc.swipeSets
  const groups = []
  entry.sets.forEach((s, i) => {
    const warm = isWarmupRow(s)
    const warmBefore = i > 0 && isWarmupRow(entry.sets[i - 1])
    const [spanStart, spanCount] = setSpanAt(entry.sets, i)
    const pairHead = spanCount === 2 && spanStart === i
    const pairTail = spanCount === 2 && spanStart !== i
    let maxLine = ''
    if (!warm && s.max) {
      maxLine = t('Max: as many reps as you can')
      const rec = maxRecordAt(H.workouts, entry.id, s.w)
      if (rec) {
        maxLine += ' · ' + (rec.w > 0
          ? tn('Record: {0} rep at {1}', 'Record: {0} reps at {1}', rec.r, fmtNum(rec.w) + ' ' + S.unit)
          : tn('Record: {0} rep', 'Record: {0} reps', rec.r))
      }
    }
    const g = {
      i,
      warmHdr: warm && !warmBefore,
      sep: !warm && warmBefore,
      maxLine,
      tail: pairTail,
      kind: perSide && isSideSet(s) ? 'side' : pairHead ? 'pair' : 'plain',
      rows: [],
      side: null,
      hint: !!(hint && swipeOn && hint.i === i),
      flash: !!(flash && flash.i >= spanStart && flash.i < spanStart + spanCount),
      flashId: flash ? flash.id : 0,
      plate: loadLine(String(i)),
      drops: [],
      bursts: [],
      shortcuts: null,
    }
    if (!pairTail) {
      if (g.kind === 'side') {
        g.side = {
          num: setNumberAt(entry.sets, i), fail: isFailureSet(s), done: !!s.done,
          L: sideRowVM(s, i, 'L'), R: sideRowVM(s, i, 'R'),
        }
      } else if (pairHead) g.rows = [plainRow(s, i), plainRow(entry.sets[i + 1], i + 1)]
      else g.rows = [plainRow(s, i)]
    }
    if (!warm && mode === 'reps') {
      g.drops = dropsOf(s).map((d, di) => ({ di, label: t('Drop {0}', di + 1), w: d.w == null ? null : d.w, r: d.r == null ? null : d.r, plate: loadLine(i + ':d' + di) }))
      g.bursts = clustersOf(s).map((b, ci) => ({ ci, label: t('Burst {0}', ci + 1), r: b.r == null ? null : b.r, rest: b.restSec + 's' }))
      if (wc.setShortcuts) g.shortcuts = { drop: !isRestPauseSet(s), burst: !isDropSet(s) }
    }
    groups.push(g)
  })

  const tags = []
  if (!dense) {
    if (cardio) tags.push({ k: 'cardio', icon: 'figureRun', text: t('Cardio'), acc: true })
    if (!cardio && isPerSide(cfg)) tags.push({ k: 'side', icon: 'sides', text: t('Per side'), acc: true, nocap: true })
    if (ex.tg || ex.bp) tags.push({ k: 'mus', icon: '', text: t(MUSCLE_NAME[ex.tg] || ex.tg || ex.bp) })
    if (ex.eq) tags.push({ k: 'eq', icon: '', text: t(ex.eq) })
    if (best > 0) tags.push({ k: 'best', icon: '', text: t('Best:') + ' ' + fmtNum(best) + ' ' + S.unit, nocap: true })
  }

  const lastCount = entry.sets.length ? setSpanAt(entry.sets, entry.sets.length - 1)[1] : 1
  const vm = {
    idx,
    id: entry.id,
    name: exerciseNameFor(ex),
    cap: !!exerciseNameClass(ex),
    big: !(compact || dense),
    note: entry.note || '',
    noProg: entry.noProg === true,
    dense,
    planLine,
    tags,
    cfgNote: dense ? '' : (cfg.note || ''),
    standingNote: dense ? '' : (standingNote || ''),
    pinnedNote: dense || !pinned ? '' : t('From {0}:', fmtDate(pinned.d, true)) + ' ' + pinned.note,
    refText: dense ? '' : refText,
    prog: !dense && guidance && !editing ? {
      icon: plan.kind === 'up' ? 'arrowUp' : plan.kind === 'deload' ? 'arrowDown' : 'lightbulb',
      warn: plan.kind === 'deload',
      label: t(guidance.policyLabel),
      why: t(...guidance.why),
    } : null,
    pairBtns: !!(wc.pairButtons && !compact && !dense && pairable),
    pairPrev: pairable && idx > 0,
    pairNext: pairable && idx < A.entries.length - 1,
    head: {
      eff3: !!col3, timed, perSide, plain: !wc.steppers,
      h1: col1.hd, h2: col2 ? col2.hd : '', h3: col3 ? col3.hd : '', h3eff: !!(col3 && col3.eff),
    },
    steppers: !!wc.steppers,
    hasC2: !!col2,
    hasC3: !!col3,
    eff3: !!col3,
    timed,
    groups,
    swipe: swipeOn,
    shortcuts: !!wc.setShortcuts,
    removeSetDis: entry.sets.length <= lastCount,
    loadStep: c.loadStep,
    repStep: col2 && col2.f === 'r' ? col2.step : 1,
  }
  return { vm, ctx: { ...c, entryId: entry.id, plateLoading, loadKind, base, last, guidance, editing } }
}

/** The ⋯ menu's "Plate loading" subtitle (Workout.jsx loadSummary). */
export function loadSummaryOf(S, ctx) {
  if (ctx.loadKind === 'none') return t('Off')
  if (ctx.loadKind === 'single') return t('Single stack')
  if (!usesBar(ctx.ex)) return t('Per side')
  return ctx.base > 0 ? t('Bar {0}', fmtNum(ctx.base) + ' ' + S.unit) : t('No bar')
}

/** The ⋯ menu's rest subtitle: the exercise's own rest, or the default. */
export function restSubOf(S, entry) {
  const own = entry && entry.target && entry.target.restSec > 0 ? entry.target.restSec : 0
  return own ? fmtRest(own) : t('Default ({0})', fmtRest(S.restSec))
}

export { exerciseNameText }
