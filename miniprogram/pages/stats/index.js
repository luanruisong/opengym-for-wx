// Stats tab (frontend/src/views/Stats.jsx): the analytics hub. Tiles, the activity heatmap,
// muscle balance / fatigue / strength, the plan's weekly muscle volume, links to structural
// balance, progress photos and measurements, effort, body weight and exercise progress, and
// the last workouts.
//
// Everything shown is worked out in mapState with the lib functions the original used. The
// heavy parts are memoised (memo below) on the S reference plus the page's own choices
// (this.st). store.update deep-copies S, so every sub-reference (S.workouts, S.bodyweight…)
// changes with any update anyway: S itself is the honest key. A new S comes only from an
// update; the rest timer ticking every second changes the UI store, not S, and recomputes
// nothing here.
import { connectPage } from '../../utils/page.js'
import { navTo, takeTabQuery } from '../../utils/nav.js'
import { useStore } from '../../store/store.js'
import { bwDeltaColor } from '../../store/actions.js'
import { bwSheet, goalSheet, calendarSheet, dayOverrideSheet, workoutDetailSheet, exerciseHistorySheet, weighInsSheet } from '../../utils/sheets.js'
import { EXIDX, matchExercise, betterWeight, isAssisted } from '../../lib/exercises.js'
import { lastBW, streakWeeks, setLabel, modeOf, effortOf, entriesForExercise, metricEntriesForExercise, metricModeForEntry, bestWeightForEntry, completedRepsOf, workoutDay, workoutAt, setsDone } from '../../lib/history.js'
import { fmtNum, fmtDate, fmtVol, durPart, todayISO, isoOf, weekKey, weekStartOf, exerciseNameText } from '../../lib/format.js'
import { speedUnitOf, speedLabel, toSpeed } from '../../lib/speed.js'
import { t, tn, exerciseNameFor } from '../../lib/i18n.js'
import { loadOfWeeklyPlan, loadOfWorkouts, muscleBalanceWindow, rankOf, MUSCLES, MUSCLE_NAME, musclesOf } from '../../lib/muscles.js'
import { fatigueOf, strengthOf, STRENGTH_FLOOR, LB_TO_KG, anchorsByWorkout, resolveSetRir } from '../../lib/recovery.js'
import { strengthExerciseRowsForMuscle } from '../../lib/strength-exercises.js'
import { fatigueStateOf } from '../../lib/recovery-view.js'
import { e1rmSeries, best1RM, formulaOf } from '../../lib/onerm.js'
import { currentDbLoad, workoutAs } from '../../lib/dumbbells.js'
import { maxRepsSeries } from '../../lib/pyramid.js'
import { perSetSessions, perSetLines, dropOffSet } from '../../lib/per-set.js'
import {
  hasEffort, hasEstimableEffort, displayScale, scaleName, toScale, avgRir, effortSummary, effortWeeks,
  effortHistogram, isHardSet, HARD_RIR, MIN_RATED,
} from '../../lib/effort.js'
import { isWarmupRow } from '../../lib/workout-model.js'
import { glyphOf } from '../../lib/glyphs.js'
import { workoutMediaOf } from '../../lib/media-refs.js'

const DAY = 86400000
// Set 1 to 5 on the per-set chart — system colours, so each line keeps its hue in dark mode.
const SET_COLORS = ['var(--blue)', 'var(--green)', 'var(--orange)', 'var(--purple)', 'var(--pink)']
const PLAN_VOLUME_ROWS = 5
const RECENT_N = 6

const rangeOptions = () => [{ value: 30, label: '1M' }, { value: 90, label: '3M' }, { value: 365, label: '1Y' }, { value: 0, label: t('All') }]
const rangeStart = days => (days ? Date.now() - days * DAY : 0)

export const FATIGUE_LEVELS = [
  { at: 0, level: 0 },
  { at: 0.15, level: 1 },
  { at: 0.25, level: 2 },
  { at: 0.4, level: 3 },
  { at: 0.55, level: 4, exclusive: true },
]
export const STRENGTH_LEVELS = [
  { at: STRENGTH_FLOOR, level: 0 },
  { at: 0.625, level: 1 },
  { at: 0.75, level: 2 },
  { at: 0.875, level: 3 },
  { at: 1, level: 4 },
]

const DEFAULTS = () => ({
  range: 90,            // body weight chart, days (0 = all)
  exId: null, exMetric: 'top', exRange: 0, exFrom: 0,
  mbView: 'balance', mbWin: 7, mbWeekOffset: 0, mbHard: false, mbSel: null, mbExpanded: false,
  effWin: 90,
  planAll: false,
  pickerOpen: false, pickerQ: '',
})

// memo(ctx, key, deps, fn): fn() again only when one of deps changed (===).
function memo(ctx, key, deps, fn) {
  const box = ctx.__memo || (ctx.__memo = {})
  const m = box[key]
  if (m && m.deps.length === deps.length && m.deps.every((d, i) => d === deps[i])) return m.v
  const v = fn()
  box[key] = { deps, v }
  return v
}

function latestMuscleTraining(workouts) {
  const latest = {}
  for (const workout of workouts || []) {
    const timestamp = workoutAt(workout)
    if (!Number.isFinite(timestamp)) continue
    for (const entry of workout.entries || []) {
      if (!(entry.sets || []).some(set => set && set.done === true && !isWarmupRow(set))) continue
      const exercise = EXIDX[entry.id] || entry.exercise || entry
      for (const slug of Object.keys(musclesOf(exercise))) {
        if (latest[slug] == null || timestamp > latest[slug]) latest[slug] = timestamp
      }
    }
  }
  return latest
}

export function weeksSinceTraining(now, lastTrained) {
  return Math.max(0, Math.floor((now - lastTrained) / DAY / 7))
}

function fatigueLabel(value) {
  const state = fatigueStateOf(value)
  return t(state === 'ready' ? 'Ready' : state === 'recovering' ? 'Recovering' : 'Fatigued')
}

function profileBodyweightKg(S) {
  const entries = S.bodyweight || []
  if (!entries.length) return null
  const sorted = entries.slice().sort((a, b) => String(a.d).localeCompare(String(b.d)))
  const last = sorted[sorted.length - 1]
  if (!last || !(last.w > 0)) return null
  return S.unit === 'lb' ? last.w * LB_TO_KG : last.w
}

const round1 = v => Math.round((v || 0) * 10) / 10
const mname = m => t(MUSCLE_NAME[m])

/* ------------------------------------------------------------ muscle balance -- */
function muscleBalance(ctx, S, st, now) {
  const workouts = S.workouts
  const minute = Math.floor(now / 60000)
  const bodyweightKg = memo(ctx, 'bwKg', [S], () => profileBodyweightKg(S))
  const view = st.mbView
  const win = st.mbWin
  const sel = st.mbSel
  const weekly = win === 7
  const ws = weekStartOf(S)
  const today = todayISO()

  const base = memo(ctx, 'mbBase', [S, win, st.mbWeekOffset, st.mbHard, minute, today], () => {
    const currentWeek = weekKey(today, ws)
    const selectedWeekDate = new Date(currentWeek + 'T12:00:00')
    selectedWeekDate.setDate(selectedWeekDate.getDate() + st.mbWeekOffset * 7)
    const selectedWeek = isoOf(selectedWeekDate)
    const inWin = weekly
      ? workouts.filter(w => workoutDay(w) && weekKey(workoutDay(w), ws) === selectedWeek)
      : muscleBalanceWindow(workouts, win, now, today, ws)
    const rated = inWin.some(w => w.entries.some(e => e.sets.some(s => s.done && isHardSet(s))))
    const on = !weekly && st.mbHard && rated
    const load = loadOfWorkouts(inWin, on ? isHardSet : null)
    const planned = weekly && st.mbWeekOffset === 0 ? loadOfWeeklyPlan(S) : {}
    return { selectedWeek, inWin: inWin.length, rated, on, load, planned }
  })
  const { selectedWeek, rated, on, load, planned } = base
  const inWinN = base.inWin

  const out = {
    view, win, weekly, rated, on, sel: sel || '',
    viewOpts: [{ value: 'balance', label: t('Muscle balance') }, { value: 'fatigue', label: t('Fatigue') }, { value: 'strength', label: t('Strength') }],
    winOpts: [{ value: 7, label: t('Week') }, { value: 30, label: '30d' }, { value: 90, label: '90d' }, { value: 0, label: t('All') }],
    body: S.body === 'female' ? 'female' : 'male',
    title: t('Muscle balance'),
    by: on ? t('by hard sets') : t('by sets worked'),
    hardLabel: on ? t('Hard') : t('All'),
    showHardBtn: !weekly && rated,
    weekLabel: t('Week of {0}', fmtDate(selectedWeek)),
    nextDisabled: st.mbWeekOffset === 0,
    weekOffset: st.mbWeekOffset,
    selName: sel ? mname(sel) : '',
  }

  if (view === 'balance') {
    const { worked, missed } = rankOf(load)
    const max = worked.length ? load[worked[0]] : 0
    const sets = m => fmtNum(round1(load[m]))
    out.load = load
    out.hasData = inWinN > 0
    out.emptyText = t('No workouts in this period yet.')
    // The current week compares with the plan; other windows list what was done.
    out.comparison = weekly && st.mbWeekOffset === 0
    let rows = []
    let toggleN = 0
    if (out.comparison) {
      const comparisonMuscles = MUSCLES
        .filter(m => (planned[m] || 0) > 0 || (load[m] || 0) > 0)
        .sort((a, b) => (load[b] || 0) - (load[a] || 0) || (planned[b] || 0) - (planned[a] || 0) || MUSCLES.indexOf(a) - MUSCLES.indexOf(b))
      const visible = sel ? [sel] : st.mbExpanded ? comparisonMuscles : comparisonMuscles.slice(0, 4)
      rows = visible.map(m => {
        const completed = round1(load[m])
        const target = round1(planned[m])
        const percentage = target > 0 ? Math.round(completed / target * 100) : null
        const fill = target > 0 ? Math.round(Math.min(completed / target, 1) * 100) : completed > 0 ? 100 : 0
        return { key: m, label: mname(m), bold: sel === m, pct: fill, value: fmtNum(completed) + '/' + fmtNum(target) + (percentage == null ? '' : ' · ' + percentage + '%') }
      })
      toggleN = comparisonMuscles.length
      out.hasData = comparisonMuscles.length > 0
      out.selRow = null
    } else {
      const shown = weekly && st.mbExpanded ? worked : worked.slice(0, 4)
      out.selRow = sel ? { name: mname(sel), v: sets(sel) ? t('{0} sets', sets(sel)) : on ? t('no hard sets') : t('not trained') } : null
      rows = sel ? [] : shown.map(m => ({ key: m, label: mname(m), pct: max ? Math.round(load[m] / max * 100) : 0, color: on ? 'var(--yellow)' : '', value: t('{0} sets', sets(m)) }))
      toggleN = worked.length
    }
    out.rows = rows
    out.showToggle = weekly && !sel && toggleN > 4
    out.toggleLabel = t(st.mbExpanded ? 'Show less' : 'Show more')
    out.expanded = st.mbExpanded
    out.missedTitle = on ? t('No hard sets in this period') : t('Not trained in this period')
    out.missed = missed.map(m => ({ k: m, n: mname(m) }))
    out.allWorked = !missed.length && worked.length > 0
      ? (on ? t('Every muscle group got at least one hard set in this period.') : t('Every muscle group got some work in this period.'))
      : ''
    return out
  }

  const opts = { bodyweightKg, unit: S.unit }
  if (view === 'fatigue') {
    const fatigue = memo(ctx, 'fatigue', [S, minute], () => fatigueOf(workouts, now, opts))
    out.load = fatigue
    out.thresholds = FATIGUE_LEVELS
    out.title = t('Fatigue')
    out.note = t('Fatigue shows how recently each muscle was trained. High means rest.')
    out.selValue = sel ? fatigueLabel(fatigue[sel]) : ''
    out.legend = [{ k: 'a', txt: t('Fatigued'), c: 'l4' }, { k: 'b', txt: t('Recovering'), c: 'l2' }, { k: 'c', txt: t('Ready'), c: 'l0' }]
    return out
  }

  // strength
  const strength = memo(ctx, 'strength', [S, minute], () => strengthOf(workouts, now, opts))
  const lastTrained = memo(ctx, 'lastTrained', [S], () => latestMuscleTraining(workouts))
  const vol90 = memo(ctx, 'vol90', [S, minute], () => loadOfWorkouts(workouts.filter(w => workoutAt(w) > now - 90 * DAY), null))
  const strengthHint = slug => lastTrained[slug] == null ? t('not trained') : t('Weeks since training: {0}', weeksSinceTraining(now, lastTrained[slug]))
  const { worked: strengthOrder } = rankOf(strength)
  const detrained = strengthOrder.filter(slug => strength[slug] < 1)
  out.load = strength
  out.thresholds = STRENGTH_LEVELS
  out.title = t('Strength')
  out.note = t('Strength shows retained muscle strength. Train again to reset it.')
  out.floorTxt = fmtNum(STRENGTH_FLOOR)
  out.fullWord = t('full')
  out.floorWord = t('floor')
  if (sel) {
    const rows = memo(ctx, 'strRows', [S, minute, sel], () => strengthExerciseRowsForMuscle(S, now, sel))
    out.exHead = t('Exercises') + ' · ' + mname(sel)
    out.exRows = rows.map(row => ({
      key: row.id,
      label: row.name,
      tag: row.primary === sel ? t('primary') : t('secondary'),
      labelSub: t('Est. 1RM') + ': ' + fmtNum(row.est) + ' ' + S.unit + ' · ' + fmtDate(row.estDate, true),
      pct: Math.round(row.decay * 100),
      value: fmtNum(row.current) + ' ' + S.unit,
      valueDim: ' · ' + Math.round(row.decay * 100) + '%',
    }))
    out.exEmpty = t('No exercises with an estimated 1RM yet.')
  } else {
    out.tapHint = t('Tap a muscle to see its exercises.')
  }
  out.detrained = detrained.map(slug => {
    const sets90 = round1(vol90[slug])
    return {
      key: slug, label: mname(slug), pct: Math.round(strength[slug] * 100),
      value: sets90 ? t('{0} sets', fmtNum(sets90)) : strengthHint(slug),
      sub: sets90 ? strengthHint(slug) : '',
    }
  })
  return out
}

/* ------------------------------------------------------------------- effort -- */
function effortCard(ctx, S, st) {
  const win = st.effWin
  return memo(ctx, 'effort', [S, win], () => {
    const kind = displayScale(S)
    const hd = scaleName(kind)
    const logged = effortSummary(S, win)
    const blend = logged.rated < MIN_RATED
    const opts = { unit: S.unit, bodyweightKg: profileBodyweightKg(S) }
    const anchors = blend ? anchorsByWorkout(S.workouts, opts) : new Map()
    const resolve = (s, w, e) => resolveSetRir(s, s, e, w, anchors.get(w), opts)
    const sum = blend ? effortSummary(S, win, resolve) : logged
    const weeks = blend ? effortWeeks(S, win, resolve) : effortWeeks(S, win)
    const hist = blend ? effortHistogram(S, win, resolve) : effortHistogram(S, win)
    const estimated = blend && sum.est > 0
    const maxBin = Math.max(1, ...hist.map(b => b.n))
    const pts = weeks.map(w => ({ t: w.t, y: toScale(kind, w.rir), note: t('{0} sets', w.sets) }))
    const binLabel = b => kind === 'rpe' ? (b.tail ? '≤ 6' : String(10 - b.rir)) : (b.tail ? b.rir + '+' : String(b.rir))
    return {
      win,
      winOpts: [{ value: 30, label: '30d' }, { value: 90, label: '90d' }, { value: 365, label: '1Y' }, { value: 0, label: t('All') }],
      head: t('Effort'),
      headSub: '· ' + t('how close to failure') + (estimated ? ' · ' + t('estimated') : ''),
      empty: sum.rated === 0 && sum.est === 0,
      emptyText: t('No rated sets in this period.'),
      avg: sum.avg == null ? '–' : fmtNum(toScale(kind, sum.avg)) + ' ' + hd,
      avgLabel: t('average effort'),
      hard: sum.hardPct == null ? '–' : Math.round(sum.hardPct * 100) + '%',
      hardLabel: t('at {0} {1} or harder', hd, fmtNum(toScale(kind, HARD_RIR))),
      count: estimated
        ? t('{0} rated · {1} estimated of {2} sets', sum.rated, sum.est, sum.done)
        : t('{0} of {1} finished sets rated', sum.rated, sum.done),
      off: effortOf(S) === 'none' ? t('Effort per set is off. Turn it on in Settings → Workout to keep rating.') : '',
      pts: pts.length > 1 ? pts : [],
      weekByWeek: t('Week by week'),
      unit: hd,
      invert: kind === 'rir',
      whereTitle: t('Where the sets land'),
      bins: hist.map(b => ({
        key: String(b.rir), label: hd + ' ' + binLabel(b), pct: Math.round(b.n / maxBin * 100),
        color: b.rir <= HARD_RIR ? 'var(--yellow)' : 'var(--label-3)',
        value: b.n ? b.n + ' · ' + Math.round(b.pct * 100) + '%' : '–',
      })),
      foot: t('Most working sets belong close to failure, not at it. Half at the floor and half at the top still average out to a healthy-looking middle.'),
    }
  })
}

/* --------------------------------------------------------- exercise progress -- */
// The per-exercise data of the whole history (independent of the chosen range/metric).
function exerciseIndex(S) {
  const workouts = S.workouts
  const meantIn = {}
  const metricDataOf = (workout, id) => {
    if (!(id in meantIn)) meantIn[id] = currentDbLoad(S, id)
    const entries = metricEntriesForExercise(workoutAs(workout, id, meantIn[id]), id)
    const mode = (entries.length && entries[entries.length - 1].mode) || null
    const sameMode = entries.filter(item => item.mode === mode)
    const best = mode === 'reps' ? sameMode.reduce((value, item) => {
      const candidate = bestWeightForEntry(item.entry)
      if (!(candidate > 0)) return value
      return value > 0 ? betterWeight(id, value, candidate) : candidate
    }, 0) : 0
    const rows = []
    sameMode.forEach(item => rows.push(...item.rows))
    return { mode, entries: sameMode, rows, best }
  }
  const entryCache = {}
  const entryOf = id => {
    if (id in entryCache) return entryCache[id]
    let found = null
    for (const w of workouts) { found = w.entries.find(e => e.id === id); if (found) break }
    return (entryCache[id] = found)
  }
  const listOf = value => Array.isArray(value) ? value : value == null || value === '' ? [] : [value]
  const firstAvailable = (...values) => {
    for (const value of values) { const list = listOf(value); if (list.length) return list }
    return []
  }
  const nameOf = id => {
    if (EXIDX[id]) return exerciseNameFor(EXIDX[id])
    const entry = entryOf(id)
    return (entry && ((entry.muscleSnapshot && entry.muscleSnapshot.n) || entry.n)) || id
  }
  const matcherOf = id => {
    if (EXIDX[id]) return EXIDX[id]
    const entry = entryOf(id) || {}
    const snapshot = entry.muscleSnapshot || {}
    const primaries = firstAvailable(snapshot.primaries, entry.primaries)
    const secondaries = firstAvailable(snapshot.sm, snapshot.secondaries, snapshot.muscleGroups, entry.sm, entry.secondaries, entry.muscleGroups)
    return {
      n: snapshot.n || entry.n || id, bp: snapshot.bp || entry.bp || '',
      tg: primaries[0] || snapshot.tg || entry.tg || '', sm: secondaries,
      eq: snapshot.eq || entry.eq || '', desc: snapshot.desc || entry.desc || '',
    }
  }
  const speedUnit = speedUnitOf(S)
  const currentOf = id => {
    for (let i = workouts.length - 1; i >= 0; i--) {
      const data = metricDataOf(workouts[i], id)
      if (!data.mode) continue
      const mode = data.mode
      const rows = data.rows
      const mx = mode === 'reps'
        ? data.best
        : Math.max(0, ...rows.map(s => mode === 'cardio' ? toSpeed(s.speed || 0, speedUnit) : mode === 'time' ? (s.sec || 0) : (s.w || 0)))
      if (mx > 0) return { mx, unit: mode === 'cardio' ? speedLabel(speedUnit) : mode === 'time' ? 's' : S.unit }
      if (mode === 'reps') {
        const reps = Math.max(0, ...rows.map(completedRepsOf))
        if (reps > 0) return { mx: reps, unit: t('reps') }
      }
    }
    return { mx: 0, unit: S.unit }
  }
  const ids = []
  const seen = new Set()
  workouts.forEach(w => w.entries.forEach(e => { if (!seen.has(e.id)) { seen.add(e.id); ids.push(e.id) } }))
  const exHist = ids.filter(id => EXIDX[id] || nameOf(id) !== id)
  const exCurrent = {}
  exHist.forEach(id => { exCurrent[id] = currentOf(id) })
  exHist.sort((a, b) => exCurrent[b].mx - exCurrent[a].mx || nameOf(a).localeCompare(nameOf(b)))
  const options = exHist.map(id => ({
    id,
    label: (EXIDX[id] ? exerciseNameText(EXIDX[id]) : nameOf(id)) + (exCurrent[id].mx ? ' · ' + fmtNum(exCurrent[id].mx) + ' ' + exCurrent[id].unit : ''),
  }))
  return { exHist, options, metricDataOf, matcherOf, speedUnit }
}

// Everything about one exercise that does not depend on the range.
function exerciseSeries(S, idx, curEx) {
  const workouts = S.workouts
  const { metricDataOf, speedUnit } = idx
  const kind = displayScale(S)
  const hd = scaleName(kind)
  const curMode = (() => {
    for (let i = workouts.length - 1; i >= 0; i--) {
      const data = metricDataOf(workouts[i], curEx)
      if (data.mode) return data.mode
      const entries = entriesForExercise(workouts[i], curEx)
      for (let j = entries.length - 1; j >= 0; j--) {
        const mode = metricModeForEntry(entries[j])
        if (mode) return mode
      }
    }
    return modeOf({ id: curEx })
  })()
  const curCardio = curMode === 'cardio'
  const curTimed = curMode === 'time'
  const repsOnly = curMode === 'reps' && !workouts.some(w => entriesForExercise(w, curEx).some(en => bestWeightForEntry(en) > 0))
  const metric = s => curCardio ? toSpeed(s.speed || 0, speedUnit) : curTimed ? (s.sec || 0) : (s.w || 0)
  const exUnit = curCardio ? speedLabel(speedUnit) : curTimed ? 's' : repsOnly ? t('reps') : S.unit
  const exPts = []
  let exBest = 0
  workouts.forEach(w => {
    const data = metricDataOf(w, curEx)
    if (data.mode !== curMode) return
    const doneSets = data.rows
    const last = data.entries[data.entries.length - 1]
    const representative = last && last.entry
    const mx = curMode === 'reps'
      ? (repsOnly ? Math.max(0, ...doneSets.map(completedRepsOf)) : data.best)
      : Math.max(0, ...doneSets.map(metric))
    if (mx > 0) {
      exPts.push({ t: w.start, y: mx, d: w.d, sets: doneSets, target: representative && representative.target })
      const better = curMode === 'reps' && !repsOnly ? betterWeight(curEx, exBest || mx, mx) : Math.max(exBest, mx)
      exBest = exBest > 0 ? better : mx
    }
  })
  const exList = exPts.slice(-5).reverse().map((p, i) => ({
    k: i, d: fmtDate(p.d, true), sets: p.sets.map(s => setLabel(curEx, s, p.target, speedUnit)).join('  '),
  }))
  const isReps = curMode === 'reps'
  const e1Pts = isReps ? e1rmSeries(S, curEx) : []
  const e1Best = isReps ? best1RM(S, curEx) : null
  const exRir = exPts.map(p => avgRir(p.sets))
  const showEff = exRir.filter(v => v != null).length >= 3
  const effPts = exPts.map((p, i) => (exRir[i] == null ? null : { t: p.t, y: toScale(kind, exRir[i]), d: p.d })).filter(Boolean)
  const maxPts = isReps ? maxRepsSeries(workouts, curEx).map(p => ({ t: p.t, y: p.y, d: p.d, note: p.w > 0 ? fmtNum(p.w) + ' ' + S.unit : undefined })) : []
  const maxBest = maxPts.length ? Math.max(...maxPts.map(p => p.y)) : 0
  let perSet = null
  if (isReps) {
    const formula = formulaOf(S)
    const usable = list => list.length >= 2 && list.some(s => s.sets.length >= 2)
    let m = repsOnly || isAssisted(curEx) ? 'reps' : 'e1rm'
    let sessions = perSetSessions(workouts, curEx, { metric: m, formula })
    if (m === 'e1rm' && !usable(sessions)) sessions = perSetSessions(workouts, curEx, { metric: m = 'reps' })
    if (usable(sessions)) {
      const { lines, hidden } = perSetLines(sessions)
      const shown = new Set(lines.map(l => l.n))
      perSet = {
        series: lines.map(l => ({ n: l.n, points: l.points, color: SET_COLORS[l.n - 1] })),
        anchors: sessions.map(s => ({
          t: s.t, d: s.d, y: Math.max(...s.sets.map(x => x.y)),
          note: s.sets.filter(x => shown.has(x.n)).map(x => x.n + ': ' + (repsOnly ? x.r : fmtNum(x.w) + '×' + x.r)).join(' · '),
        })),
        ns: lines.map(l => l.n), hidden, metric: m, drop: dropOffSet(sessions),
      }
    }
  }
  const topPts = exPts.map((p, i) => ({
    t: p.t, y: p.y, d: p.d,
    m: exRir[i] == null ? null : 1 - Math.min(4, Math.max(0, exRir[i])) / 4,
    note: exRir[i] == null ? undefined : hd + ' ' + fmtNum(toScale(kind, exRir[i])),
  }))
  return { curMode, curCardio, curTimed, repsOnly, exUnit, exBest, exList, e1Pts: e1Pts.map(p => ({ t: p.t, y: p.y, d: p.d })), e1Best, showEff, effPts, maxPts, maxBest, perSet, topPts, kind, hd }
}

function exerciseProgress(ctx, S, st) {
  const idx = memo(ctx, 'exIdx', [S], () => exerciseIndex(S))
  const out = {
    title: t('Exercise progress'),
    hasHist: idx.exHist.length > 0,
    emptyText: t('Finish your first workout and your progress curves will show up here.'),
  }
  if (!out.hasHist) return out
  const curEx = st.exId && idx.exHist.includes(st.exId) ? st.exId : idx.exHist[0]
  const ser = memo(ctx, 'exSer', [S, curEx], () => exerciseSeries(S, idx, curEx))
  const from = st.exFrom
  const inR = p => p.t >= from
  const perSetChart = ser.perSet ? (() => {
    const series = ser.perSet.series.map(s => ({ points: s.points.filter(inR), color: s.color, n: s.n })).filter(s => s.points.length)
    return { anchors: ser.perSet.anchors.filter(inR), series, ns: series.map(s => s.n) }
  })() : null
  const showE1 = ser.e1Pts.length > 0
  const showMax = ser.maxPts.length > 0
  const onSets = !!ser.perSet && st.exMetric === 'sets'
  const onE1 = showE1 && st.exMetric === 'e1rm'
  const onEff = ser.showEff && st.exMetric === 'effort'
  const onMax = showMax && st.exMetric === 'max'
  const chartPts = onSets ? perSetChart.anchors : onMax ? ser.maxPts.filter(inR) : onEff ? ser.effPts.filter(inR) : onE1 ? ser.e1Pts.filter(inR) : ser.topPts.filter(inR)
  const rangeTooShort = st.exRange !== 0 && chartPts.length < 2
  const exOpts = [{ value: 'top', label: t('Top set') }]
  if (ser.perSet) exOpts.push({ value: 'sets', label: t('Per set') })
  if (showE1) exOpts.push({ value: 'e1rm', label: t('Est. 1RM') })
  if (ser.showEff) exOpts.push({ value: 'effort', label: t('Effort') })
  if (showMax) exOpts.push({ value: 'max', label: t('Max reps') })
  const opt = idx.options.find(o => o.id === curEx)
  let chart
  if (onSets) chart = { pts: perSetChart.anchors, series: perSetChart.series.map(s => ({ points: s.points, color: s.color })), unit: ser.perSet.metric === 'reps' ? t('reps') : S.unit, color: 'var(--acc)', invert: false }
  else if (onMax) chart = { pts: chartPts, series: [], unit: t('reps'), color: 'var(--blue)', invert: false }
  else if (onEff) chart = { pts: chartPts, series: [], unit: ser.hd, color: 'var(--yellow)', invert: ser.kind === 'rir' }
  else chart = { pts: chartPts, series: [], unit: onE1 ? S.unit : ser.exUnit, color: 'var(--blue)', invert: false }
  const caption = onSets ? (ser.perSet.metric === 'reps' ? t('Reps in each working set, one line per set number') : t('Estimated 1RM of each working set, one line per set number'))
    : onMax ? t('Most reps in a Max set per workout')
    : onEff ? t('Average effort per workout')
    : onE1 ? t('Estimated 1RM per workout')
    : ser.curCardio ? t('Top speed per workout')
    : ser.curTimed ? t('Longest hold per workout')
    : ser.repsOnly ? t('Most reps in a set per workout')
    : t('Best set weight per workout')
  let best = ''
  if (onMax) best = ser.maxBest + ' ' + t('reps')
  else if (!onEff && !onSets) best = fmtNum(onE1 ? ser.e1Best.est : ser.exBest) + ' ' + (onE1 ? S.unit : ser.exUnit)
  let dropLine = ''
  if (onSets && (ser.perSet.drop || ser.perSet.hidden > 0)) {
    const d = ser.perSet.drop
    dropLine = (d ? t('Where you most often drop off: set {0} ({1} of {2} workouts)', d.n, d.count, d.of) : '') +
      (d && ser.perSet.hidden > 0 ? ' · ' : '') +
      (ser.perSet.hidden > 0 ? t('Only the first {0} sets are drawn.', ser.perSet.ns.length) : '')
  }
  return Object.assign(out, {
    exLabel: t('Exercise'),
    cur: curEx,
    curLabel: opt ? opt.label : curEx,
    exOpts: exOpts.length > 1 ? exOpts : [],
    metric: onMax ? 'max' : onEff ? 'effort' : onE1 ? 'e1rm' : onSets ? 'sets' : 'top',
    range: st.exRange,
    rangeOpts: rangeOptions(),
    tooShort: rangeTooShort,
    tooShortText: t('Fewer than two workouts in this period. Pick a longer one.'),
    chart,
    legend: onSets && !rangeTooShort ? perSetChart.ns.map(n => ({ n, txt: t('Set {0}', n), dot: 'background:' + SET_COLORS[n - 1] })) : [],
    list: ser.exList,
    caption,
    bestLabel: best ? t('Best:') : '',
    best,
    dropLine,
    e1Line: onE1 && ser.e1Best ? t('Best estimate from {0} on {1}. An estimate, not a tested max.', fmtNum(ser.e1Best.w) + ' ' + S.unit + ' × ' + ser.e1Best.r, fmtDate(ser.e1Best.d, true)) : '',
    dotLine: !onEff && !onE1 && !onMax && !onSets && ser.showEff ? t('A fuller dot means less left in the tank. The same weight at a lower {0} is progress the line alone doesn’t show.', ser.hd) : '',
  })
}

// The exercise list of the picker sheet, filtered by its search box.
function pickerList(ctx, S, st) {
  if (!st.pickerOpen) return []
  const idx = memo(ctx, 'exIdx', [S], () => exerciseIndex(S))
  const q = st.pickerQ.trim()
  const cur = st.exId && idx.exHist.includes(st.exId) ? st.exId : idx.exHist[0]
  return idx.options
    .filter(o => !q || matchExercise(idx.matcherOf(o.id), q))
    .slice(0, 200)
    .map(o => ({ id: o.id, label: o.label, on: o.id === cur }))
}

/* --------------------------------------------------------------- the rest -- */
function weeklyPlanVolume(ctx, S, st) {
  const load = memo(ctx, 'planLoad', [S], () => loadOfWeeklyPlan(S))
  const muscles = rankOf(load).worked
  const shown = st.planAll ? muscles : muscles.slice(0, PLAN_VOLUME_ROWS)
  const max = muscles.length ? load[muscles[0]] : 0
  return {
    rows: shown.map(m => ({ key: m, label: mname(m), pct: max ? Math.round(load[m] / max * 100) : 0, value: t('{0} sets', fmtNum(round1(load[m]))) })),
    empty: !muscles.length,
    emptyText: t('No muscle volume planned.'),
    showToggle: muscles.length > PLAN_VOLUME_ROWS,
    toggleLabel: t(st.planAll ? 'Show less' : 'Show more'),
    all: st.planAll,
    any: Object.keys(load).length > 0,
  }
}

function workoutRow(S, w) {
  const r = (S.routines || []).find(x => x.id === w.routineId) || {}
  const mediaN = workoutMediaOf(w).length
  return {
    id: String(w.id != null ? w.id : w.start),
    glyph: glyphOf(r.emoji),
    name: w.name || '',
    sub: [fmtDate(w.d, true), ...durPart(w.end - w.start), tn('{0} set', '{0} sets', setsDone(w)), fmtVol(w.vol, S.unit)].join(' · '),
    mediaN,
    prN: (w.prs && w.prs.length) || 0,
  }
}

Page(connectPage({
  data: {},

  mapState(S, { ui }) {
    const st = this.st || (this.st = DEFAULTS())
    const now = Date.now()
    const workouts = S.workouts || []
    const today = todayISO()

    // tiles
    const bw30 = S.bodyweight.filter(b => (b.t || new Date(b.d).getTime()) > now - 30 * DAY)
    const bwDelta30 = bw30.length > 1 ? bw30[bw30.length - 1].w - bw30[0].w : null
    const month = today.slice(0, 7)
    const tiles = {
      workouts: workouts.length,
      month: workouts.filter(w => (workoutDay(w) || '').slice(0, 7) === month).length,
      streak: memo(this, 'streak', [S, today], () => streakWeeks(S)),
      bw: bwDelta30 === null ? '–' : (bwDelta30 > 0 ? '+' : '') + fmtNum(bwDelta30) + ' ' + S.unit,
      bwStyle: bwDelta30 === null ? '' : 'color:' + bwDeltaColor(bwDelta30, (lastBW(S) || {}).w || 0),
    }

    const plan = weeklyPlanVolume(this, S, st)
    const showEffort = memo(this, 'hasEff', [S], () => hasEffort(S) || hasEstimableEffort(S))
    const showMB = workouts.length > 0 || plan.any

    // body weight
    const range = st.range
    const bwPts = memo(this, 'bwPts', [S, range], () => S.bodyweight
      .filter(b => range === 0 || (b.t || new Date(b.d).getTime()) > Date.now() - range * DAY)
      .map(b => ({ t: b.t || new Date(b.d).getTime(), y: b.w, d: b.d })))

    const lastMeasure = (S.measurements || []).length ? S.measurements[S.measurements.length - 1] : null

    return {
      resting: !!(ui.timer || ui.work),
      tiles,
      hmMetric: S.heatmapMetric === 'vol' ? 'vol' : 'time',
      showMB,
      mb: showMB ? muscleBalance(this, S, st, now) : null,
      showPlan: S.routines.length > 0,
      plan,
      hasWorkouts: workouts.length > 0,
      measureSub: lastMeasure
        ? t('Last check-in {0}', fmtDate(lastMeasure.d, true))
        : t('Waist, arms, body fat and anything else you measure, each with its own curve.'),
      showEffort,
      eff: showEffort ? effortCard(this, S, st) : null,
      bw: {
        goal: S.targetW ? fmtNum(S.targetW) : t('Goal'),
        goalOn: !!S.targetW,
        goalV: S.targetW || null,
        range,
        rangeOpts: rangeOptions(),
        pts: bwPts,
        unit: S.unit,
        any: S.bodyweight.length > 0,
      },
      ex: exerciseProgress(this, S, st),
      picker: { open: st.pickerOpen, q: st.pickerQ, list: pickerList(this, S, st) },
      recent: memo(this, 'recent', [S], () => workouts.slice(-RECENT_N).reverse().map(w => workoutRow(S, w))),
      allN: t('All') + ' ' + workouts.length,
    }
  },

  setLocal(patch) {
    if (!this.st) this.st = DEFAULTS()
    Object.assign(this.st, patch)
    if (this.__refresh) this.__refresh()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setData({ selected: 2 })
    // Fatigue and strength age with the clock: recompute on coming back.
    if (this.__refresh) this.__refresh()
    const q = takeTabQuery('/pages/stats/index')
    if (q && q.focus === 'weekly-volume') {
      setTimeout(() => wx.pageScrollTo({ selector: '#weekly-volume', duration: 300, fail: () => {} }), 350)
    }
  },

  /* header & links */
  onHistory() { navTo('/history') },
  onBalance() { navTo('/structural-balance') },
  onPhotos() { navTo('/progress-photos') },
  onMeasure() { navTo('/measurements') },

  /* heatmap */
  onHmMetric(e) {
    const metric = e.detail.metric
    useStore.getState().update(s => { s.heatmapMetric = metric })
  },
  onHmDay(e) {
    const iso = e.detail.iso
    const ws = useStore.getState().S.workouts.filter(w => workoutDay(w) === iso)
    if (ws.length === 1) workoutDetailSheet(ws[0])
    else if (ws.length) calendarSheet(iso)
    else dayOverrideSheet(iso)
  },

  /* muscle balance */
  onMbView(e) { this.setLocal({ mbView: e.detail.value }) },
  onMbWin(e) { this.setLocal({ mbWin: e.detail.value, mbSel: null, mbExpanded: false }) },
  onMbHard() { this.setLocal({ mbHard: !this.st.mbHard, mbSel: null }) },
  onPrevWeek() { this.setLocal({ mbWeekOffset: this.st.mbWeekOffset - 1, mbSel: null, mbExpanded: false }) },
  onNextWeek() {
    if (this.st.mbWeekOffset >= 0) return
    this.setLocal({ mbWeekOffset: Math.min(0, this.st.mbWeekOffset + 1), mbSel: null, mbExpanded: false })
  },
  onMuscle(e) {
    const m = e.detail.part
    this.setLocal({ mbSel: this.st.mbSel === m ? null : m })
  },
  onMbToggle() { this.setLocal({ mbExpanded: !this.st.mbExpanded }) },
  onStrengthEx(e) { exerciseHistorySheet(e.detail.key) },

  /* plan volume */
  onPlanToggle() { this.setLocal({ planAll: !this.st.planAll }) },

  /* effort */
  onEffWin(e) { this.setLocal({ effWin: e.detail.value }) },

  /* body weight */
  onGoal() { goalSheet() },
  onLogBw() { bwSheet() },
  onBwRange(e) { this.setLocal({ range: e.detail.value }) },
  onWeighIns() { weighInsSheet() },

  /* exercise progress */
  onExMetric(e) { this.setLocal({ exMetric: e.detail.value }) },
  onExRange(e) { const v = e.detail.value; this.setLocal({ exRange: v, exFrom: rangeStart(v) }) },
  onPickerOpen() { this.setLocal({ pickerOpen: true, pickerQ: '' }) },
  onPickerClose() { this.setLocal({ pickerOpen: false }) },
  onPickerQ(e) { this.setLocal({ pickerQ: e.detail.value || '' }) },
  onPickerClear() { this.setLocal({ pickerQ: '' }) },
  onPickEx(e) { this.setLocal({ exId: e.currentTarget.dataset.id, pickerOpen: false }) },

  /* recent workouts */
  onWorkout(e) {
    const id = e.detail.id
    const w = useStore.getState().S.workouts.find(x => String(x.id != null ? x.id : x.start) === id)
    if (w) workoutDetailSheet(w)
  },
}))
