// The exercise settings sheet's logic (frontend/src/sheets.jsx ExConfig + ProgressionFields +
// BarWeightEditor + DbLoadPicker), pulled out of the page so it can be tested in Node:
//   initDraft     the draft `c` the sheet opens on
//   modeOf...     helpers the original computed in render
//   viewOf        every string / flag the WXML shows, from the draft and the store
//   saveOut       what Save hands to onSave (null while the progression step is invalid)
//   edit*         the draft changes behind each control (pure: they return a new draft)
//   apply*        the per-exercise plate-loading writes, applied to the store draft `s`
import { isCardio, isBodyweightEq, isAssisted, smOf } from '../../lib/exercises.js'
import { fmtNum } from '../../lib/format.js'
import { defaultConfig, modeOf, isBw, isPerSide, sideReps, MAX_PLANNED_WARMUPS } from '../../lib/history.js'
import { usesBar, defaultBarWeight, hasBarOverride, isNoBar } from '../../lib/bar.js'
import { withLoadKind, loadKindFor, baseWeightFor } from '../../lib/plates.js'
import { t, tn, descFor, exerciseNameFor, exerciseNameClass } from '../../lib/i18n.js'
import { REST_MAX, fmtRest } from '../../lib/duration.js'
import { MUSCLE_NAME, muscleWeightsOf } from '../../lib/muscles.js'
import { isBellEx, dbLoadOf, dbLoadFor, isOneArm } from '../../lib/dumbbells.js'
import { policyFor, defaultIncrement, POLICIES_FOR, POLICY_NAME, POLICY_DESC, MAX_BW_SETS, MAX_TRIPLE_SETS } from '../../lib/progression.js'
import { normalizeRepRange } from '../../lib/rep-range.js'
import { isBackoff, backoffWeights } from '../../lib/backoff.js'
import { isPyramid, normalizePyramid, normalizePyramidRest, normalizePyramidWeight, pyramidFromFlat, flatFromPyramid, pyramidLabel, PYRAMID_MAX, MAX_PYRAMID_SETS, PYRAMID_PRESETS } from '../../lib/pyramid.js'
import { speedUnitOf, toSpeed, fromSpeed } from '../../lib/speed.js'

export { REST_MAX }

/* ---------- helpers, as in sheets.jsx ---------- */
export const progressionStepOf = (c, mode, ex, unit) =>
  c.inc >= 0 ? c.inc : (mode === 'time' ? 5 : defaultIncrement(ex.id, unit))
export const progressionStepIsValid = (step, policy, backoff = false) =>
  (policy === 'off' && !backoff) || (Number.isFinite(step) && step > 0)
export const backoffOffered = (c, mode, ex, bw) => mode === 'reps' && !bw && !isAssisted({ ...c, id: ex.id })
  && !(Array.isArray(c.pyramid) && c.pyramid.length) && !(c.intensifier && c.intensifier.type === 'restpause')
export const climbsRange = policy => policy === 'double' || policy === 'triple'
export const setsMaxOf = c => Math.max(Math.max(1, Math.round(c.sets) || 1), Math.min(MAX_TRIPLE_SETS, Math.round(c.setsMax) || 0))
export const intensifierToSave = x => (x.type === 'dropset'
  ? { ...x, count: Math.max(1, Math.round(x.count) || 0), pct: Math.max(5, Number(x.pct) || 0) }
  : x.type === 'restpause'
    ? { ...x, totalReps: Math.max(1, Math.round(x.totalReps) || 0), restSec: Math.max(5, Number(x.restSec) || 0) }
    : x)
const trainedBy = ex => { const weights = muscleWeightsOf(ex); return slug => weights[slug] !== 0 }
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)))

/* ---------- draft ---------- */
export function initDraft(ex, { existing, initial, S, routine } = {}) {
  const seed = existing || initial || defaultConfig(ex.id)
  const cfg = clone(seed) || {}
  // A session's target carries the meaning of its dumbbell weight as a stamp (lib/dumbbells.js);
  // one that only repeats the exercise's own default is not the slot's choice, so it is not kept.
  if (cfg.dbLoad != null && dbLoadOf(cfg.dbLoad) === dbLoadFor(S, ex.id)) delete cfg.dbLoad
  return climbsRange(policyFor({ ...cfg, id: ex.id }, routine, modeOf({ ...cfg, id: ex.id })))
    ? { ...cfg, ...normalizeRepRange(cfg.reps, cfg.repsMin, isPerSide(cfg) ? 2 : 1) }
    : cfg
}

// The derived facts render and save both need.
export function derive(c, ex, routine) {
  const cardio = isCardio(ex.id)
  const mode = cardio ? 'cardio' : modeOf({ ...c, id: ex.id })
  const bw = !cardio && isBw({ ...c, id: ex.id })
  const perSide = isPerSide(c)
  const pyramid = mode === 'reps' && isPyramid({ ...c, mode })
  const activePolicy = policyFor({ ...c, id: ex.id }, routine, mode)
  const ranged = mode === 'reps' && climbsRange(activePolicy)
  const triple = mode === 'reps' && activePolicy === 'triple'
  return { cardio, mode, bw, perSide, pyramid, activePolicy, ranged, triple }
}

export function stepInvalid(c, ex, routine, unit) {
  const d = derive(c, ex, routine)
  return !progressionStepIsValid(progressionStepOf(c, d.mode, ex, unit), d.activePolicy,
    c.backoff === true && backoffOffered(c, d.mode, ex, d.bw))
}

/* ---------- save (ExConfig save(), unchanged) ---------- */
export function saveOut(c, ex, { S, routine } = {}) {
  const unit = S && S.unit
  if (stepInvalid(c, ex, routine, unit)) return null
  const { cardio, mode, bw, perSide, pyramid, activePolicy, ranged, triple } = derive(c, ex, routine)
  const sets = Math.max(1, Math.round(c.sets) || (cardio ? 1 : 3))
  const prog = {}
  if (c.prog) prog.prog = c.prog
  if (c.inc > 0) prog.inc = c.inc
  if (mode === 'reps' && !bw && (activePolicy === 'linear' || climbsRange(activePolicy))) {
    const deloadFactor = Math.max(0.5, Math.min(0.95, Number(c.deloadFactor) || 0.9))
    if (deloadFactor !== 0.9) prog.deloadFactor = deloadFactor
  }
  const flags = {}
  if (bw !== isBodyweightEq(ex.id)) flags.bodyweight = bw
  const note = (c.note || '').trim().slice(0, 500)
  const withNote = note ? { note } : {}
  const warmupSets = Math.max(0, Math.min(MAX_PLANNED_WARMUPS, Math.round(c.warmupSets) || 0))
  const withWarmups = warmupSets ? { warmupSets } : {}
  const restSec = Math.max(0, Math.round(c.restSec) || 0)
  const withRest = restSec ? { restSec } : {}
  const dbLoad = isBellEx(ex) && !bw ? dbLoadOf(c.dbLoad) : null
  const withMeant = dbLoad ? { dbLoad } : {}
  const withFailure = c.lastToFailure === true ? { lastToFailure: true } : {}
  if (cardio) return { sets, min: Math.max(1, Math.round(c.min) || 20), speed: Math.max(0, c.speed || 8), ...withNote, ...withRest }
  if (mode === 'time') return { sets, mode: 'time', sec: Math.max(1, Math.round(c.sec) || 45), weight: Math.max(0, c.weight || 0), ...flags, ...(perSide ? { side: true } : {}), ...prog, ...withNote, ...withWarmups, ...withRest, ...withMeant, ...withFailure }
  const typed = Math.max(1, Math.round(c.reps) || 10)
  const stride = perSide ? 2 : 1
  let reps = perSide ? Math.ceil(typed / stride) * stride : typed
  let range = null
  if (ranged) {
    range = normalizeRepRange(reps, c.repsMin, stride)
    reps = range.reps
  }
  const out = { sets, mode: 'reps', reps, weight: Math.max(0, c.weight || 0), ...flags, ...(perSide ? { side: true } : {}), ...prog, ...withNote, ...withWarmups, ...withRest, ...withMeant }
  const list = pyramid ? normalizePyramid(c.pyramid, stride) : []
  if (list.length) Object.assign(out, flatFromPyramid(list), { pyramid: list })
  const pyramidRest = list.length ? normalizePyramidRest(c.pyramidRest, list.length) : []
  if (pyramidRest.length) out.pyramidRest = pyramidRest
  const pyramidWeight = list.length && !bw ? normalizePyramidWeight(c.pyramidWeight, list.length) : []
  if (pyramidWeight.length) out.pyramidWeight = pyramidWeight
  if (ranged) out.repsMin = range.repsMin
  if (triple && !list.length && setsMaxOf(c) > sets) out.setsMax = setsMaxOf(c)
  if (bw && !(out.weight > 0) && c.repsMax > 0) out.repsMax = Math.max(reps, Math.round(c.repsMax))
  if (!list.length && c.intensifier && c.intensifier.type) out.intensifier = intensifierToSave(c.intensifier)
  if (c.backoff === true && backoffOffered(out, 'reps', ex, bw) && isBackoff({ ...out, backoff: true })) out.backoff = true
  if (!list.length) Object.assign(out, withFailure)
  return out
}

/* ---------- draft edits ---------- */
// Reps / Time (keeps what the other mode had, fills only what is missing).
export function editMode(c, m, ex, routine) {
  const next = { ...defaultConfig(ex.id, m), ...c, mode: m }
  return m === 'reps' && climbsRange(policyFor({ ...next, id: ex.id }, routine, 'reps'))
    ? { ...next, ...normalizeRepRange(next.reps, next.repsMin, isPerSide(next) ? 2 : 1) }
    : next
}

// The progression rule ('' = follow the routine).
export function editRule(c, v, ex, routine) {
  const { mode, perSide } = derive(c, ex, routine)
  const stride = mode === 'reps' && perSide ? 2 : 1
  const next = { ...c, prog: v || undefined }
  if (v === 'greyskull' && next.lastToFailure == null) next.lastToFailure = true
  const picked = policyFor({ ...next, id: ex.id }, routine, mode)
  if (picked === 'triple' && !(next.setsMax > 0)) next.setsMax = Math.min(MAX_TRIPLE_SETS, Math.max(1, Math.round(next.sets) || 1) + 2)
  return climbsRange(picked)
    ? { ...next, ...normalizeRepRange(next.reps, next.repsMin, stride) }
    : next
}

// The rules the Rule row offers (null = the row is not shown).
export function ruleOptions(c, ex, routine) {
  const { mode, bw } = derive(c, ex, routine)
  const options = (POLICIES_FOR[mode] || ['off']).filter(p => p !== 'triple' || !bw || c.weight > 0 || c.prog === 'triple')
  if (options.length < 2) return null
  const inherited = policyFor({ id: ex.id }, routine, mode)
  return [{ value: '', label: t('Follow the routine ({0})', t(POLICY_NAME[inherited])) },
    ...options.map(p => ({ value: p, label: t(POLICY_NAME[p]) }))]
}

export function editBodyweight(c, v) {
  return { ...c, bodyweight: v, weight: v ? 0 : c.weight }
}

export function editPerSide(c, v, ex, routine) {
  const { mode } = derive(c, ex, routine)
  if (mode === 'time') return { ...c, side: v || undefined }
  const next = { ...c, side: v || undefined, reps: v ? Math.ceil((c.reps || 0) / 2) * 2 : c.reps }
  return climbsRange(policyFor({ ...next, id: ex.id }, routine, 'reps'))
    ? { ...next, ...normalizeRepRange(next.reps, next.repsMin, v ? 2 : 1) }
    : next
}

export const editFailure = (c, v) => ({ ...c, lastToFailure: v || undefined })

export function editPyramidOn(c, v) {
  return v
    ? { ...c, pyramid: c.pyramidDraft || pyramidFromFlat(c), intensifier: undefined }
    : { ...c, ...flatFromPyramid(c.pyramid), pyramidDraft: c.pyramid, pyramid: undefined }
}

export const editPyramidPreset = (c, k) =>
  ({ ...c, pyramid: [...PYRAMID_PRESETS[k]], pyramidRest: undefined, pyramidWeight: undefined })

export const editPyramidAt = (c, i, v) => ({ ...c, pyramid: c.pyramid.map((p, j) => (j === i ? v : p)) })

export function editPyramidMax(c, i) {
  const p = c.pyramid[i]
  return editPyramidAt(c, i, p === PYRAMID_MAX ? (c.reps || 10) : PYRAMID_MAX)
}

export function editPyramidRest(c, i, v) {
  const rest = Array.from({ length: c.pyramid.length }, (_, j) => (c.pyramidRest || [])[j] || 0)
  rest[i] = v
  return { ...c, pyramidRest: rest }
}

export function editPyramidWeight(c, i, v) {
  const weight = Array.from({ length: c.pyramid.length }, (_, j) => (c.pyramidWeight || [])[j] || 0)
  weight[i] = v
  return { ...c, pyramidWeight: weight }
}

export function editPyramidRemove(c, i) {
  return {
    ...c,
    pyramid: c.pyramid.filter((_, j) => j !== i),
    pyramidRest: c.pyramidRest && c.pyramidRest.filter((_, j) => j !== i),
    pyramidWeight: c.pyramidWeight && c.pyramidWeight.filter((_, j) => j !== i),
  }
}

export function editPyramidAdd(c) {
  if (c.pyramid.length >= MAX_PYRAMID_SETS) return c
  return {
    ...c,
    pyramid: [...c.pyramid, c.pyramid[c.pyramid.length - 1]],
    pyramidRest: c.pyramidRest && c.pyramidRest.length ? [...c.pyramid.map((_, j) => c.pyramidRest[j] || 0), c.pyramidRest[c.pyramid.length - 1] || 0] : c.pyramidRest,
    pyramidWeight: c.pyramidWeight && c.pyramidWeight.length ? [...c.pyramid.map((_, j) => c.pyramidWeight[j] || 0), c.pyramidWeight[c.pyramid.length - 1] || 0] : c.pyramidWeight,
  }
}

export function editIntensifier(c, v, S) {
  const x = c.intensifier || {}
  return {
    ...c,
    intensifier: !v ? undefined : v === 'dropset'
      ? { type: 'dropset', count: x.count || 1, pct: x.pct || 20 }
      : { type: 'restpause', totalReps: x.totalReps || c.reps || 8, restSec: x.restSec || (S && S.restPauseSec) || 15 },
  }
}

export const editDbLoad = (c, v, ex, S) => ({ ...c, dbLoad: v === dbLoadFor(S, ex.id) ? undefined : v })

// A stepper's value into the draft. `k` names the field (the WXML data-k); `i` is the pyramid set.
export function editField(c, k, v, { i, S } = {}) {
  switch (k) {
    case 'sets': case 'min': case 'sec': case 'weight': case 'reps': case 'repsMax':
    case 'inc': case 'repsMin': case 'setsMax':
      return { ...c, [k]: v }
    case 'speed': return { ...c, speed: fromSpeed(v, speedUnitOf(S)) }
    case 'warmupSets': return { ...c, warmupSets: Math.max(0, Math.min(MAX_PLANNED_WARMUPS, Math.round(v) || 0)) }
    case 'deload': return { ...c, deloadFactor: Number(v) / 100 }
    case 'dropCount': return { ...c, intensifier: { ...c.intensifier, count: v } }
    case 'dropPct': return { ...c, intensifier: { ...c.intensifier, pct: v } }
    case 'rpReps': return { ...c, intensifier: { ...c.intensifier, totalReps: v } }
    case 'rpRest': return { ...c, intensifier: { ...c.intensifier, restSec: v } }
    case 'restSec': return { ...c, restSec: v }
    case 'note': return { ...c, note: v }
    case 'pyrRep': return editPyramidAt(c, i, v)
    case 'pyrRest': return editPyramidRest(c, i, v)
    case 'pyrW': return editPyramidWeight(c, i, v)
    default: return c
  }
}

/* ---------- plate loading (BarWeightEditor): writes to the store draft `s` ---------- */
function kindDefaults(ex, cfg) {
  const ctx = { ...(cfg || {}), id: ex.id }
  return cfg ? [loadKindFor(null, ctx)]
    : isBodyweightEq(ex.id) ? [true, false].map(b => loadKindFor(null, { id: ex.id, bodyweight: b }))
      : [loadKindFor(null, ctx)]
}
export function applyLoadKind(s, ex, cfg, k) {
  const defaults = kindDefaults(ex, cfg)
  s.loadKind = withLoadKind(s.loadKind, ex.id, defaults.every(d => d === k) ? null : k)
}
export function applyBarWeight(s, ex, v) {
  s.barWeights = s.barWeights || {}
  const n = Math.max(0, Math.round((v || 0) * 100) / 100)
  if (n > 0) s.barWeights[ex.id] = n; else delete s.barWeights[ex.id]
}
export function applyNoBar(s, ex, on) {
  s.barWeights = s.barWeights || {}
  if (on) s.barWeights[ex.id] = 0; else delete s.barWeights[ex.id]
}

/* ---------- the view ---------- */
// Everything the page shows. `opts`: { existing, saveLabel, canReplace, canDelete, isCustom }.
export function viewOf(c, ex, S, routine, opts = {}) {
  const st = S || {}
  const unit = st.unit || 'kg'
  const speedUnit = speedUnitOf(st)
  const { cardio, mode, bw, perSide, pyramid, activePolicy, ranged, triple } = derive(c, ex, routine)
  const invalidStep = stepInvalid(c, ex, routine, unit)
  const it = c.intensifier && c.intensifier.type ? c.intensifier : null
  const restpause = !!(it && it.type === 'restpause')

  const tags = []
  if (cardio) tags.push({ k: 'cardio', label: t('Cardio'), cls: 'acc', icon: 'figureRun' })
  tags.push({ k: 'tg', label: t(MUSCLE_NAME[ex.tg] || ex.tg || ex.bp || ''), cls: '', icon: '' })
  if (ex.eq) tags.push({ k: 'eq', label: t(ex.eq), cls: '', icon: '' })
  if (!cardio) {
    const sec = (ex.secondaries && ex.secondaries.length ? ex.secondaries : smOf(ex)) || []
    sec.filter(trainedBy(ex)).slice(0, 3).forEach((s, i) => tags.push({ k: 's' + i, label: t(MUSCLE_NAME[s] || s), cls: 'dim', icon: '' }))
  }

  const v = {
    name: exerciseNameFor(ex),
    nameCls: exerciseNameClass(ex),
    tags,
    desc: descFor(ex) || '',
    cardio, mode, bw, perSide, pyramid,
    modeOpts: [{ value: 'reps', label: t('Reps') }, { value: 'time', label: t('Time') }],
    unit,
    // main row
    mainMb: mode === 'time' ? 8 : 18,
    setsLabel: cardio ? t('Intervals') : triple ? t('Sets from') : t('Sets'),
    sets: num(c.sets),
    showSets: cardio || mode === 'time' || (!restpause && !pyramid),
    min: num(c.min),
    speedLabel: speedUnit === 'mph' ? t('Speed (mph)') : t('Speed (km/h)'),
    speed: cardio ? num(toSpeed(c.speed, speedUnit)) : null,
    sec: num(c.sec),
    weightLabel: t('Weight ({0})', unit),
    weight: num(c.weight),
    showTimeWeight: mode === 'time' && !bw,
    showReps: mode === 'reps' && !ranged && !pyramid,
    reps: num(c.reps),
    repStep: perSide ? 2 : 1,
    showRepsWeight: mode === 'reps' && !bw && !pyramid,
  }

  // pyramid
  v.presets = PYRAMID_PRESETS.map((p, k) => ({ k, label: pyramidLabel(p) }))
  v.pyramidRows = pyramid ? c.pyramid.map((p, i) => ({
    i,
    isMax: p === PYRAMID_MAX,
    label: t('Set {0}', i + 1),
    maxText: t('Max: as many reps as you can'),
    value: p === PYRAMID_MAX ? null : num(p),
    rest: num((c.pyramidRest || [])[i] || 0),
    weight: num((c.pyramidWeight || [])[i] || 0),
  })) : []
  v.canRemoveSet = pyramid && c.pyramid.length > 1
  v.canAddSet = pyramid && c.pyramid.length < MAX_PYRAMID_SETS
  v.restpauseNote = restpause

  // warm-ups
  v.showWarmups = !cardio && !restpause
  v.warmupSets = c.warmupSets || 0
  v.warmupText = (c.warmupSets || 0) > 0
    ? t('Added before your work sets and left out of volume, records and progression. Each one closes half the gap to the work weight, never below the bar on a barbell lift, and you can still change any of them mid-session.')
    : t('Ramp-up sets added before the work sets, so you do not have to add them by hand each session.')
  v.timeNote = mode === 'time' && !bw

  // rest
  v.restValue = c.restSec > 0 ? fmtRest(c.restSec) : t('Default ({0})', fmtRest(st.restSec))

  // switches
  v.bwSub = bw ? (mode === 'time' ? t('No weight to enter. Just time the hold.') : t('No weight to enter. Just log the reps.')) : t('Ask for a weight on every set.')
  v.perSideSub = mode === 'time'
    ? (perSide
      ? tn('{0} set becomes {1}: one on each side, {2}s held every time.', '{0} sets become {1}: one on each side, {2}s held every time.', c.sets || 0, (c.sets || 0) * 2, c.sec || 0)
      : t('For side planks, single-arm holds and the like. Trains each side on its own.'))
    : (perSide ? t('You still log the total: {0} is {1} per side.', c.reps || 0, fmtNum(sideReps(c.reps))) : t('For lunges, single-arm rows and the like.'))
  v.showFailure = !pyramid
  v.failure = c.lastToFailure === true
  v.failureSub = c.lastToFailure ? t('The last set goes until nothing is left, and counts as all-out effort unless you rate it.') : t('Plan the final set as an all-out one.')
  v.showPyramidToggle = mode === 'reps'

  // added weight / rep ceiling
  v.addedLabel = t('Added ({0})', unit)
  v.added = num(c.weight || 0)
  v.showRepsMax = mode === 'reps' && bw && !(c.weight > 0)
  v.repsMax = num(c.repsMax || 0)
  v.repsMaxText = c.repsMax > 0
    ? t('Reps climb to {0}, then a set is added and the reps start over. At {1} sets it asks you to add weight instead.', c.repsMax, MAX_BW_SETS)
    : t('Reps climb by one whenever every set was clean. Set a ceiling to add sets instead of reps forever.')

  // drop-set / rest-pause
  v.showIntens = mode === 'reps' && !pyramid
  v.intensType = it ? it.type : ''
  v.intensValue = !it ? t('None') : it.type === 'dropset' ? t('Drop-set') : t('Rest-pause')
  v.dropCount = it && it.type === 'dropset' ? num(it.count) : null
  v.dropPct = it && it.type === 'dropset' ? num(it.pct) : null
  v.rpReps = restpause ? num(it.totalReps) : null
  v.rpRest = restpause ? num(it.restSec) : null
  v.intensText = !it ? '' : it.type === 'dropset'
    ? t('Every set becomes a drop-set: after the main set, {0} drop(s) with no rest, each about {1}% lighter.', it.count, it.pct)
    : t('Every set becomes rest-pause: {0} reps to start, then {1} more split into short bursts, {2}s rest before each, roughly halving each time.', c.reps || 0, it.totalReps, it.restSec)

  // what a dumbbell weight means
  v.showDb = isBellEx(ex) && !bw && mode !== 'cardio'
  if (v.showDb) {
    const value = dbLoadFor(st, { ...c, id: ex.id })
    const one = isOneArm({ ...c, id: ex.id })
    v.dbOpts = [{ value: 'as', label: t('As entered') }, { value: 'each', label: t('Each') }, { value: 'total', label: t('Both') }]
    v.dbValue = value
    v.dbText = value === 'each' ? (one ? t('The weight of the one you hold. One arm, so it counts once.') : t('The weight of one, so 20 means 20 in each hand. Volume counts both.'))
      : value === 'total' ? t('Both together, so 40 means two 20s.')
        : t('Counted as you type it, the way it always was.')
  } else { v.dbOpts = []; v.dbValue = ''; v.dbText = '' }

  // plate loading
  v.showPlate = mode === 'reps'
  if (v.showPlate) {
    const bar = usesBar(ex)
    const kind = loadKindFor(st, { ...c, id: ex.id })
    const explicit = hasBarOverride(st, ex.id)
    const noBar = bar && isNoBar(st, ex.id)
    const def = defaultBarWeight(ex.eq, unit)
    const extra = t('Applies to this exercise everywhere, not just this plan.')
    v.kindOpts = [{ value: 'pairs', label: t('Per side') }, { value: 'single', label: t('Single stack') }, { value: 'none', label: t('Off') }]
    v.kind = kind
    v.kindText = kind === 'pairs' ? t('Plates split over both sides of a bar.')
      : kind === 'single' ? t('One stack: a belt, a landmine, a plate-loaded machine, a sled.')
        : t('No plate line under the sets.')
    v.kindOn = kind !== 'none'
    v.bar = bar
    v.noBar = noBar
    v.baseLabel = bar ? t('Bar ({0})', unit) : t('Base weight ({0})', unit)
    v.base = num(baseWeightFor(st, ex))
    v.plateText = (noBar ? t('Plates are counted from 0. Turn this off for the default ({0}).', fmtNum(def) + ' ' + unit)
      : bar ? (explicit ? t('Set to 0 to go back to the default ({0}).', fmtNum(def) + ' ' + unit) : t('Default for this bar type.'))
        : t('The machine or sled itself, before any plate goes on. 0 if it is all plates.')) + (extra ? ' ' + extra : '')
  } else {
    Object.assign(v, { kindOpts: [], kind: '', kindText: '', kindOn: false, bar: false, noBar: false, baseLabel: '', base: null, plateText: '' })
  }

  // progression (ProgressionFields)
  v.pyramidProgNote = pyramid
  const options = pyramid ? null : ruleOptions(c, ex, routine)
  const p = { show: !!options }
  if (options) {
    const active = activePolicy
    const inc = progressionStepOf(c, mode, ex, unit)
    const canBackoff = backoffOffered(c, mode, ex, bw)
    const backoff = canBackoff && c.backoff === true
    const preview = backoff && c.weight > 0 && inc > 0
      ? backoffWeights(c.weight, Math.max(1, Math.round(c.sets) || 1), inc).map(fmtNum).join(' → ') + ' ' + unit
      : ''
    const stride = mode === 'reps' && perSide ? 2 : 1
    const range = climbsRange(active) ? normalizeRepRange(c.reps, c.repsMin, stride) : null
    const epleyEligible = mode === 'reps' && !isBw({ ...c, id: ex.id }) && (active === 'linear' || climbsRange(active))
    const deloadPercent = Math.round((c.deloadFactor != null && Number.isFinite(Number(c.deloadFactor)) ? Number(c.deloadFactor) : 0.9) * 100)
    const picked = options.find(o => o.value === (c.prog || ''))
    Object.assign(p, {
      ruleValue: picked ? picked.label : '',
      desc: t(POLICY_DESC[active]),
      descMb: active === 'off' ? 18 : 10,
      showRow: active !== 'off' || backoff,
      row4: (active === 'double' && epleyEligible) || active === 'triple',
      stepLabel: mode === 'time' ? t('Step (seconds)') : t('Step ({0})', unit),
      step: num(inc),
      stepStep: mode === 'time' ? 5 : 1.25,
      stepDecimal: mode !== 'time',
      invalid: !progressionStepIsValid(inc, active, backoff),
      invalidMsg: t('Enter a positive step to use this progression rule.'),
      showRange: climbsRange(active),
      repsFrom: range ? num(c.repsMin != null ? c.repsMin : range.repsMin) : null,
      repsTo: range ? num(c.reps != null ? c.reps : range.reps) : null,
      stride,
      showSetsMax: active === 'triple',
      setsMax: active === 'triple' ? num(c.setsMax != null ? c.setsMax : setsMaxOf(c)) : null,
      showDeload: epleyEligible,
      deload: deloadPercent,
      canBackoff,
      backoff,
      backoffText: backoff
        ? (preview ? t('Sets open at {0}. The first set goes up when every set reaches its reps, and the rest follow it.', preview) : t('The first set goes up when every set reaches its reps, and the rest follow it.'))
        : t('All sets at the same weight.'),
    })
  }
  v.prog = p

  v.note = c.note || ''
  v.saveLabel = opts.saveLabel || (opts.existing ? t('Save') : t('Add to routine'))
  v.saveDisabled = invalidStep
  v.showCustom = !!opts.isCustom
  v.showReplace = !!opts.canReplace
  v.showDelete = !!opts.canDelete
  return v
}
