// The flows of frontend/src/sheets.jsx (and a few the views kept inline) that are not rendering:
// starting, repeating, backfilling and finishing a workout, saving an edited one, plan and
// history imports, swaps, deletes. Same names and arguments as the original, so the page code
// reads like the original. Where the original opened a sheet, these call the page opener of the
// same name in utils/sheets.js; a sheet the original built inline (a three-way choice) is a
// wx.showActionSheet.
//
// Navigation after a sheet. A sheet page calls the callback it was handed (onDone, onPick…) and
// then wx.navigateBack(). A flow that moves to another page from inside such a callback must not
// race that back: afterSheet() waits until the sheet page has left the top of the stack (or, if
// it never leaves, replaces it), then navigates.
import { useStore } from './store.js'
import { useUI } from './ui.js'
import { navTo, openPage, back } from '../utils/nav.js'
import { confirmSheet, menuSheet, bwSheet, exercisePicker, exConfigSheet, planImportSheet } from '../utils/sheets.js'
import { EXIDX, isCustomEx, betterWeight, beatsWeight, smOf } from '../lib/exercises.js'
import { profileEquipment } from '../lib/equipment.js'
import { fmtNum, todayISO, uid, exCount, DAYN } from '../lib/format.js'
import { buildSets, defaultConfig, cleanupSg, modeOf, applyIntensifierPlan, setsDoneActive, setUnitsTotal, workoutVolume, bestWeightFor, bestWeightForEntry } from '../lib/history.js'
import { dropGrid } from '../lib/plates.js'
import { beep } from '../lib/sound.js'
import { t, tn } from '../lib/i18n.js'
import { buildStarterPlan, starterPlanDays } from '../lib/starter.js'
import { exerciseMuscleSnapshot, MUSCLE_NAME, muscleWeightsOf } from '../lib/muscles.js'
import { buildPlanBundle, parsePlan, mergePlan, planPrintHTML } from '../lib/plan-share.js'
import { is1RMRecord } from '../lib/onerm.js'
import { withMeaning, historyAs, dbLoadFor, ownedWeightsFor, entryDbLoad } from '../lib/dumbbells.js'
import { defaultIncrement, weightIncrement } from '../lib/progression.js'
import { buildCompletedWorkout, sessionEnd } from '../lib/finish-workout.js'
import { refillAfter } from '../lib/rotation.js'
import { isWarmupRow } from '../lib/workout-model.js'
import { repeatSessionEntries } from '../lib/session-repeat.js'
import { swapActiveExercise } from '../lib/active-exercise-swap.js'
import { buildSessionEntries, buildPlannedEntry, builtOutOfProgression } from '../lib/session-start.js'
import { joinSessionNoProg } from '../lib/session-noprog.js'
import { buildCombinedEntries, deriveSessionName } from '../lib/session-merge.js'
import { workoutsOn, backfillStart, backfillEnd, completeBackfill, historyAsOf, sessionHistory } from '../lib/backfill.js'
import { sameWorkout, rebuildPrHistory, MAX_DURATION_MIN, endsInFuture } from '../lib/workout-date.js'
import { editCompletedSession, editLeftEmpty, editedRecord, editChangesNothing } from '../lib/session-edit.js'
import { stampWorkout } from '../lib/sync-merge.js'
import { workoutMediaOf } from '../lib/media-refs.js'

const S = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = (m, o) => ui().toast(m, o)
const snd = () => S().sound

// Pages this module opens that utils/sheets.js has no opener for (see the store agent's report).
export const PAGES = {
  finishSummary: '/pkg-workout/summary/index',      // { w, prs, e1prs }
  importSummary: '/pkg-settings/import-summary/index', // { parsed }
  hevyImport: '/pkg-settings/hevy-import/index',     // {}
}
const WORKOUT_ROUTE = 'pkg-workout/workout/index'

/* ---------- page stack helpers ---------- */

const topPage = () => {
  try {
    if (typeof getCurrentPages !== 'function') return null
    const ps = getCurrentPages()
    return ps[ps.length - 1] || null
  } catch (e) { return null }
}
// A page opened through utils/nav.js openPage (every sheet page) carries `_k` in its query.
const isSheetPage = p => !!(p && p.options && p.options._k)

// Runs `fn(replace)` once the sheet page on top (if any) has gone back. `replace` is true when
// it did not go within a second: the caller then replaces it instead of stacking on it.
export function afterSheet(fn) {
  const first = topPage()
  if (!isSheetPage(first)) { fn(false); return }
  let n = 0
  const tick = () => {
    const cur = topPage()
    if (cur !== first) fn(false)
    else if (++n >= 20) fn(true)
    else setTimeout(tick, 50)
  }
  setTimeout(tick, 50)
}

// Navigates by web route once the sheet is out of the way.
export function navAfterSheet(to) {
  afterSheet(replace => navTo(to, replace ? { replace: true } : undefined))
}

// `close` (a sheet page's own way out, usually wx.navigateBack) then the route: the original's
// closeThenNav.
export function closeThenNav(close, to) {
  if (typeof close === 'function') close()
  navAfterSheet(to)
}

// Into the workout screen, unless it is the page on top already (it re-renders from the store).
export function navToWorkout() {
  afterSheet(replace => {
    const top = topPage()
    if (top && top.route === WORKOUT_ROUTE) return
    navTo('/workout', replace ? { replace: true } : undefined)
  })
}

/* ---------- files ---------- */

// Picks one file from a chat (the only file source a mini program has). Resolves
// { path, name, size } or null when cancelled.
export function pickFile({ extension } = {}) {
  return new Promise(resolve => {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      ...(extension ? { extension } : {}),
      success: r => resolve((r.tempFiles && r.tempFiles[0]) || null),
      fail: () => resolve(null),
    })
  })
}
export function readTextFile(path) {
  return wx.getFileSystemManager().readFileSync(path, 'utf8')
}
// A file argument as the web functions took it (a File), here: a path string, a picked
// { path } object, or { text } already read. Resolves the text, or null.
export async function textOf(file, pick) {
  if (file && typeof file === 'object' && typeof file.text === 'string') return file.text
  let path = typeof file === 'string' ? file : file && file.path
  if (!path) {
    const f = await pickFile(pick)
    if (!f) return null
    path = f.path
  }
  return readTextFile(path)
}
// Writes `content` into the app's own files and opens the share-to-chat dialog. Must run inside
// a tap handler (wx.shareFileMessage needs a user gesture). Resolves true when it was shared.
export function saveAndShareFile(name, content) {
  return new Promise(resolve => {
    let path
    try {
      path = wx.env.USER_DATA_PATH + '/' + name
      wx.getFileSystemManager().writeFileSync(path, content, 'utf8')
    } catch (e) {
      toast(t('Couldn’t save the file.'))
      resolve(false)
      return
    }
    wx.shareFileMessage({
      filePath: path,
      fileName: name,
      success: () => resolve(true),
      fail: () => resolve(false),
    })
  })
}

/* ============================ starter plan ============================ */
export const PLAN_COPY = {
  ppl: () => ({ name: t('Push / Pull / Legs'), about: t('Push, pull and legs each get their own day.') }),
  'upper-lower': () => ({ name: t('Upper / Lower'), about: t('Upper body twice, lower body twice.') }),
  'full-body': () => ({ name: t('Full Body'), about: t('Three sessions, the whole body each time.') }),
  '5x5': () => ({ name: t('5×5'), about: t('Five sets of five on the main barbell lifts.') }),
}
export const starterPlanCopy = id => (PLAN_COPY[id] ? PLAN_COPY[id]() : { name: id, about: '' })

// Adds the plan's routines (reusing one you already have under the same name and exercises) and
// puts them on its weekdays. planId is required.
export function loadStarterPlan(planId, profile) {
  const plan = buildStarterPlan(planId, profile ? profileEquipment(profile) : undefined)
  if (!plan) return false
  update(st => {
    const idOf = {}
    const sameLift = (a, b) => a.ex.length === b.ex.length && a.ex.every((e, i) => e.id === b.ex[i].id)
    plan.routines.forEach(r => {
      const have = st.routines.find(x => x.name === r.name && sameLift(x, r))
      if (have) idOf[r.id] = have.id
      else { st.routines.push(r); idOf[r.id] = r.id }
    })
    plan.schedule.forEach(({ day, routineId }) => { st.week[day] = [idOf[routineId]] })
  })
  if (plan.fit) toast(t('{0} loaded, fitted to "{1}": {2} swapped, {3} dropped', starterPlanCopy(planId).name, profile.name, plan.fit.swapped, plan.fit.dropped))
  else toast(t('{0} loaded', starterPlanCopy(planId).name))
  return true
}

// The chooser's tap (StarterPlanChooser.choose): loads at once, or first confirms when one of the
// plan's days already holds a routine. `fit` is the equipment profile to fit to, or null.
export function chooseStarterPlan(id, fit = null) {
  const days = starterPlanDays(id) || []
  const { week, routines } = S()
  const taken = day => [].concat(week[day] || []).some(rid => routines.some(r => r.id === rid))
  if (!days.some(taken)) { loadStarterPlan(id, fit); return }
  confirmSheet({
    title: t('Load {0}?', starterPlanCopy(id).name),
    message: t('The new plan goes on {0}. Your existing routines stay; only those days of the weekly plan change.', days.map(d => t(DAYN[d])).join('、')),
    confirmText: t('Load plan'),
    onConfirm: () => loadStarterPlan(id, fit),
  })
}

/* ============================ target weight ============================ */
export function bwDeltaColor(delta, currentW) {
  if (!delta) return 'var(--label-2)'
  if (!S().targetW) return 'var(--label)'
  const up = S().targetW > currentW
  return (delta > 0) === up ? 'var(--acc)' : 'var(--red)'
}

/* ============================ exercise detail ============================ */
const trainedBy = ex => { const weights = muscleWeightsOf(ex); return slug => weights[slug] !== 0 }
// The detail page's tags: body part, main muscles, equipment, then up to three helpers, each
// word once. [{ key, label, acc?, icon? }]
export function detailTags(ex) {
  const seen = new Set()
  const out = []
  const add = (label, extra) => {
    const k = String(label || '').trim().toLowerCase()
    if (!k || seen.has(k)) return false
    seen.add(k)
    out.push({ key: out.length, label, ...extra })
    return true
  }
  add(t(ex.bp), { acc: true })
  if (ex.bp === 'cardio') add(t(MUSCLE_NAME['cardiovascular system']), { icon: 'figureStrength' })
  else for (const s of (ex.primaries?.length ? ex.primaries : (ex.tg ? [ex.tg] : [])).filter(trainedBy(ex))) add(t(MUSCLE_NAME[s] || s), { icon: 'figureStrength' })
  add(t(ex.eq), { icon: 'kettlebell' })
  let helpers = 0
  for (const s of (ex.secondaries?.length ? ex.secondaries : smOf(ex)).filter(trainedBy(ex))) {
    if (helpers >= 3) break
    if (add(t(MUSCLE_NAME[s] || s))) helpers++
  }
  return out
}

export function deleteCustomEx(ex, afterDelete) {
  if (S().active?.entries.some(e => e.id === ex.id)) { toast(t('Finish your current workout first')); return }
  confirmSheet({
    title: t('Delete “{0}”?', ex.n),
    message: t('It will be removed from your routines. Already-logged workouts keep their sets.'),
    confirmText: t('Delete'), danger: true,
    onConfirm: () => {
      update(s => {
        // Keep display and muscle metadata in history before the custom catalogue row disappears.
        const snapshot = exerciseMuscleSnapshot(ex)
        s.workouts.forEach(w => w.entries.forEach(e => {
          if (e.id !== ex.id) return
          e.n = ex.n
          if (!e.muscleSnapshot || !Object.keys(e.muscleSnapshot).length) e.muscleSnapshot = snapshot
        }))
        s.customEx = (s.customEx || []).filter(x => x.id !== ex.id)
        s.routines.forEach(r => { r.ex = r.ex.filter(e => e.id !== ex.id); cleanupSg(r.ex) })
        delete s.exWeights[ex.id]
        s.favEx = (s.favEx || []).filter(id => id !== ex.id)
      })
      toast(t('Exercise deleted'))
      afterDelete && afterDelete()
    },
  })
}

/* ============================ swap an exercise mid-workout ============================ */
// Start a safe swap for one exact active-workout occurrence: the picker (same-muscle first), then
// the config page unless the picker's quick "+" was used. The picker page goes back on its own
// after onPick; the next step waits for that (afterSheet).
export function swapActiveWorkoutExercise(index) {
  const active = S().active
  if (!active?.entries?.[index]) return
  exercisePicker((ex, quick) => afterSheet(() => {
    if (quick) swapTo(ex, defaultConfig(ex.id))
    else exConfigSheet(ex, null, cfg => afterSheet(() => swapTo(ex, cfg)), null, null, null, null, t('Use in this workout'))
  }), { title: t('Swap exercise'), like: active.entries[index].id })

  function swapTo(ex, cfg) {
    const full = { ...cfg, id: ex.id }
    const st = S()
    const current = st.active?.entries?.[index]
    if (!current) return
    const slotRoutine = current.rid ? st.routines.find(r => r.id === current.rid) : null
    const freestyle = !slotRoutine
    const step = modeOf(full) === 'reps' ? weightIncrement(full, st.unit) : defaultIncrement(ex.id, st.unit)
    const past = sessionHistory(st)
    const built = freestyle
      ? { target: withMeaning(st, cfg, ex.id), plan: null, sets: applyIntensifierPlan(buildSets(historyAs(past, ex.id, dbLoadFor(st, full)), full, { step: (modeOf(full) === 'reps' && ownedWeightsFor(st, full)) || step, preferLast: true }), full, dropGrid(st, full)) }
      : buildPlannedEntry(past, full, slotRoutine, { noProg: builtOutOfProgression(current, slotRoutine) })
    const replacement = {
      id: ex.id,
      ...built,
      ...(current.rid ? { rid: current.rid } : {}),
      ...(current.noProg === true ? { noProg: true } : {}),
    }
    const apply = options => {
      // A timed callback closes over entry/set indexes: invalidate it, and the rest, first.
      ui().stopWork()
      ui().stopRest()
      update(state => { swapActiveExercise(state.active, index, replacement, options) }, true)
    }
    const logged = (current.sets || []).some(set => set.done === true)
    if (!logged) { apply(); return }
    if (current.sg) {
      menuSheet({
        title: t('Swap exercise?'),
        subtitle: t('Logged sets stay with the original exercise. Choose where the replacement belongs.'),
        items: [
          { label: t('Keep replacement in this group'), accent: true, onClick: () => apply({ loggedConfirmed: true, groupDisposition: 'keep' }) },
          { label: t('Insert after this group'), onClick: () => apply({ loggedConfirmed: true, groupDisposition: 'detach' }) },
        ],
      })
      return
    }
    confirmSheet({
      title: t('Swap exercise?'),
      message: t('Logged sets stay with the original exercise. The replacement will be inserted afterward.'),
      confirmText: t('Continue'),
      onConfirm: () => apply({ loggedConfirmed: true }),
    })
  }
}

/* ============================ share / print / import a plan ============================ */
export const planHasRoutines = st => (st.routines || []).some(r => r.ex && r.ex.length)

// The plan as a file shared to a chat. Call from a tap handler.
export function exportPlanFile() {
  const bundle = buildPlanBundle(S(), '')
  const json = JSON.stringify(bundle, null, 2)
  const name = 'opengym-plan-' + todayISO() + '.json'
  return saveAndShareFile(name, json).then(ok => { if (ok) toast(t('Plan file saved. Send it to a friend!')) })
}

// The printable plan (lib/plan-share.js planPrintHTML) as plain text.
export function planText(st = S(), opts) {
  const html = planPrintHTML(st, '', opts)
  return html
    .replace(/<head>[\s\S]*?<\/head>/i, '')
    .replace(/<footer>[\s\S]*?<\/footer>/i, '')
    .replace(/<div class="ex-s">/g, '  ')
    .replace(/<div class="w-r">/g, '  ')
    .replace(/<span class="part">[^<]*<\/span>/g, '')
    .replace(/<div class="ss-tag">([^<]*)<\/div>/g, '[$1]\n')
    .replace(/<\/(h1|h2|h3|section|header|p)>/g, '\n\n')
    .replace(/<\/div>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .split('\n').map(l => l.replace(/\s+$/, '')).filter((l, i, a) => l.trim() || (i > 0 && a[i - 1].trim()))
    .map(l => l.replace(/^\s{3,}/, ''))
    .join('\n').trim()
}
// No printing in a mini program: the whole plan goes to the clipboard as text instead.
export function printWholePlan() {
  const text = planText(S())
  wx.setClipboardData({
    data: text,
    success: () => toast(t('Copied')),
    fail: () => {},
  })
}
// A picked plan file → the import page, or a toast saying why not. `f` as importFromApp's.
export async function importPlanFile(f, onRead) {
  let text
  try { text = await textOf(f, { extension: ['json'] }) } catch (e) { toast(t('Couldn’t read that file.')); return }
  if (text == null) return
  let bundle
  try { bundle = parsePlan(text, S().unit || 'kg') }
  catch (e) { toast(e?.code === 'not-plan' ? t('Import failed: {0}', e.message) : t('Couldn’t read that file.')); return }
  onRead?.()
  planImportSheet(bundle)
}
// The plan import page's Add (PlanImport.apply): merged in, then on to the Plan tab.
export function applyPlanImport(bundle, { schedule = false } = {}) {
  update(s => mergePlan(s, bundle, { schedule }))
  toast(tn('Added {0} routine to your plan', 'Added {0} routines to your plan', bundle.routineCount))
  navAfterSheet('/plan')
}

/* ============================ workout lifecycle ============================ */
// `routineIds`: string | string[] | null — [r.id], effectiveRoutineIds(...), or []/null for freestyle.
export function startFlow(routineIds) {
  if (S().weighIn === false) { beginWorkout(routineIds, null); return }
  bwSheet({ required: true, onDone: bw => beginWorkout(routineIds, bw) })
}
export function beginWorkout(routineIds, bw) {
  const st = S()
  const { entries, routineIds: rids, routines } = buildCombinedEntries(st, routineIds)
  update(s => {
    s.active = {
      id: uid(), d: todayISO(), start: Date.now(),
      routineIds: rids,
      name: routines.length ? deriveSessionName(routines.map(r => r.name)) : t('Freestyle'),
      bw: bw || null, cur: 0, entries,
      workoutView: st.workoutView || 'cards',
    }
  })
  ui().stopRest()
  navToWorkout()
}

// "Repeat today" (#58): a saved workout's exercises as a new freestyle session dated today.
// `close` is the detail page's own way out, called before the weigh-in or the workout opens.
export function repeatWorkout(w, close) {
  const st = S()
  if (st.active) { toast(t('Finish the current workout first.')); return }
  const { entries, skipped } = repeatSessionEntries(st, w)
  if (!entries.length) { toast(t('Nothing to repeat. Its exercises no longer exist.')); return }
  const go = bw => {
    if (S().active) { toast(t('Finish the current workout first.')); return }
    update(s => {
      s.active = {
        id: uid(), d: todayISO(), start: Date.now(), routineIds: [],
        name: w.name || t('Freestyle'), bw: bw || null, cur: 0, entries,
        workoutView: s.workoutView || 'cards',
      }
    })
    ui().stopRest()
    navToWorkout()
    if (skipped) toast(tn('{0} exercise no longer exists and was left out.', '{0} exercises no longer exist and were left out.', skipped))
  }
  if (close) close()
  if (st.weighIn === false) { go(null); return }
  afterSheet(() => bwSheet({ required: true, onDone: go }))
}

// The workout detail page's Edit: the saved workout reopens in the workout screen as an edit.
export function editSavedWorkout(w, close) {
  try { update(state => { editCompletedSession(state, w) }) }
  catch (error) { toast(t(error.message)); return false }
  if (close) close()
  navToWorkout()
  return true
}

// The sentence a workout's Delete adds when its photos and videos go with it.
export function mediaGoesToo(rec) {
  const n = workoutMediaOf(rec, Infinity).length
  return n ? ' ' + tn('Its photo or video is deleted with it.', 'Its {0} photos or videos are deleted with it.', n) : ''
}
// The workout detail page's Delete, with its confirm.
export function deleteSavedWorkout(w, onDone) {
  confirmSheet({
    title: t('Delete workout?'),
    message: t('This removes it from your history for good.') + mediaGoesToo(S().workouts.find(x => sameWorkout(x, w))),
    confirmText: t('Delete'), danger: true,
    onConfirm: () => {
      update(s => { s.workouts = s.workouts.filter(x => !sameWorkout(x, w)) })
      toast(t('Workout deleted'))
      onDone && onDone()
    },
  })
}

// Ending the session without saving it (views/Workout.jsx discardWorkout), with its confirm.
// Also the finish page's onDiscard.
export function discardWorkout() {
  confirmSheet({
    title: t('Discard workout?'), message: t('The sets you logged in this session will be lost.'), confirmText: t('Discard'), danger: true,
    onConfirm: () => {
      update(s => { s.active = null })
      ui().stopRest()
      ui().stopWork()
      navAfterSheet('/home')
    },
  })
}

/* ============================ log a past workout ============================ */
// The guard History's button had before opening the page (utils/sheets.js logPastWorkoutSheet
// opens it unconditionally). Returns false with a toast while a workout runs.
export function canLogPastWorkout() {
  if (S().active) { toast(t('Finish the current workout first.')); return false }
  return true
}

// A backfilled session, built from the history before that day (historyAsOf).
export function beginBackfill({ iso, time, durationMin, routineIds, replaceId }) {
  const st = S()
  const start = backfillStart(iso, time)
  const past = historyAsOf(st, { d: iso, start, replaceId })
  const { entries, routineIds: rids, routines } = buildCombinedEntries(past, routineIds || [])
  update(s => {
    s.active = {
      id: uid(), d: iso, start,
      routineIds: rids,
      name: routines.length ? deriveSessionName(routines.map(r => r.name)) : t('Freestyle'),
      bw: null, cur: 0, entries,
      backfill: { durationMin, replaceId: replaceId || null },
      workoutView: st.workoutView || 'cards',
    }
  })
  ui().stopRest()
  navToWorkout()
}

// LogPastWorkout.submit: checks the day, time and duration (a toast and false when one is off),
// then asks Replace / Add as second when the day has a workout, and starts the backfill.
export function submitPastWorkout({ iso, time, durationMin, routineIds }) {
  const dur = Number(durationMin)
  if (!iso || iso > todayISO()) { toast(t('Pick a day up to today')); return false }
  if (!(dur >= 1)) { toast(t('Enter how long it took (at least 1 minute).')); return false }
  if (dur > MAX_DURATION_MIN) { toast(t('That’s more than a day. Keep it to 24 hours or less.')); return false }
  if (endsInFuture(iso, time, dur)) { toast(t('That’s still in the future. Try an earlier start.')); return false }
  const go = replaceId => beginBackfill({ iso, time, durationMin: Math.max(1, dur), routineIds, replaceId })
  const existing = workoutsOn(S(), iso)
  if (!existing.length) { go(null); return true }
  const items = existing.map(w => {
    const n = workoutMediaOf(w, Infinity).length
    return {
      label: existing.length > 1 ? t('Replace') + ' · ' + w.name : t('Replace'),
      sub: n > 0 ? tn('Its photo or video moves to the new workout.', 'Its {0} photos or videos move to the new workout.', n) : undefined,
      danger: true,
      onClick: () => go(w.id),
    }
  })
  items.push({ label: t('Add as second workout'), accent: true, onClick: () => go(null) })
  menuSheet({ title: t('There is already a workout on that day.'), items })
  return true
}

/* ============================ add a routine mid-session ============================ */
// AddRoutineToSession.add: the routine's entries appended (each with its `rid`), the session's
// routine list extended and its name re-derived unless it was renamed.
export function addRoutineToSession(r) {
  const st = S()
  if (!st.active || !r) return false
  const entries = buildSessionEntries(sessionHistory(st), r).map(e => ({ ...e, rid: r.id }))
  update(s => {
    if (!s.active) return
    s.active.entries.push(...entries.map(e => joinSessionNoProg(s.active, e)))
    s.active.routineIds = [...[].concat(s.active.routineIds || []), r.id]
    if (!s.active.customName) {
      s.active.name = deriveSessionName(s.active.routineIds.map(id => s.routines.find(x => x.id === id)?.name).filter(Boolean))
    }
  })
  toast(t('{0} added ({1})', r.name, exCount(r.ex.length)))
  return true
}

/* ============================ saving an edited workout ============================ */
const defaultExit = () => back()

export function saveWorkoutEdits(onExit = defaultExit) {
  if (!S().active?.editingWorkoutId) { onExit(); return }
  if (editLeftEmpty(S().active)) {
    confirmSheet({
      title: t('Delete workout?'),
      message: t('No sets are left in this workout, so there is nothing to save. Delete it from your history?') + mediaGoesToo(editedRecord(S())),
      confirmText: t('Delete workout'), cancelText: t('Keep editing'), danger: true,
      onConfirm: () => {
        useStore.getState().deleteHistoryEdit()
        ui().stopRest()
        ui().stopWork()
        toast(t('Workout deleted'))
        onExit()
      },
    })
    return
  }
  try {
    useStore.getState().saveHistoryEdit()
    ui().stopRest()
    ui().stopWork()
    toast(t('Workout updated'))
    onExit()
  } catch (error) { toast(t(error.message)) }
}

// The one save prompt that may be open; a second ask joins it and only changes where to go.
let savePrompt = null
export function exitWorkoutEdit(onExit = defaultExit) {
  if (!S().active?.editingWorkoutId) { onExit(); return }
  if (savePrompt) { savePrompt.onExit = onExit; return }
  const prompt = { onExit }
  const done = () => prompt.onExit()
  const leave = () => {
    if (!S().active?.editingWorkoutId) { done(); return }
    useStore.getState().discardHistoryEdit()
    ui().stopRest()
    ui().stopWork()
    done()
  }
  if (editChangesNothing(S())) { leave(); return }
  savePrompt = prompt
  const settle = () => { if (savePrompt === prompt) savePrompt = null }
  // Save / Don't save; the sheet's own Cancel is "Keep editing".
  wx.showActionSheet({
    alertText: t('Save workout changes?'),
    itemList: [t('Save changes'), t("Don't save")],
    success: r => { settle(); if (r.tapIndex === 0) saveWorkoutEdits(done); else if (r.tapIndex === 1) leave() },
    fail: settle,
  })
}

/* ============================ finishing ============================ */
// "60 kg × 5, 5, 4", or "60×5 · 62.5×5" when the weight changed between sets.
export function setsLine(sets, unit) {
  const ws = new Set(sets.map(s => s.w))
  const reps = s => s.r + (s.f ? ' ' + t('F') : '')
  if (ws.size === 1) {
    const w0 = sets[0].w
    return (w0 > 0 ? fmtNum(w0) + ' ' + unit + ' × ' : '') + sets.map(reps).join(', ')
  }
  return sets.map(s => (s.w > 0 ? fmtNum(s.w) + '×' : '') + reps(s)).join(' · ')
}

export function finishWorkout() {
  if (S().active?.editingWorkoutId) { saveWorkoutEdits(); return }
  const A = S().active
  if (!A) return
  const done = setsDoneActive(A)
  const total = setUnitsTotal(A.entries)
  if (!done) { confirmSheet({ title: t('Nothing logged yet'), message: t('You haven’t checked off any sets. Finish the workout anyway?'), confirmText: t('Finish anyway'), onConfirm: doFinishWorkout }); return }
  if (done < total) { confirmSheet({ title: t('Finish early?'), message: tn('{0} set still unchecked. Finish the workout now?', '{0} sets still unchecked. Finish the workout now?', total - done), confirmText: t('Finish workout'), onConfirm: doFinishWorkout }); return }
  doFinishWorkout()
}

// What the finish page (utils/sheets.js finishWorkoutSheet) says above its two ways out:
// { title, subtitle } — subtitle null when every set is checked. null with no workout running.
export function finishWorkoutPrompt() {
  const A = S().active
  if (!A) return null
  const done = setsDoneActive(A)
  const total = setUnitsTotal(A.entries)
  return {
    title: !done ? t('Nothing logged yet') : done < total ? t('Finish early?') : t('Finish workout?'),
    subtitle: !done ? t('You haven’t checked off any sets. Finish the workout anyway?')
      : done < total ? tn('{0} set still unchecked. Finish the workout now?', '{0} sets still unchecked. Finish the workout now?', total - done) : null,
  }
}

// Files the running workout: PRs, the completed record (or a backfill into its day), best
// weights, the rotation's next pass; then the summary page. Returns { w, prs, e1prs }.
export function doFinishWorkout() {
  const st = S()
  const A = st.active
  if (!A) return null
  const past = !!A.backfill
  const prs = []
  const e1prs = []
  if (!past) A.entries.forEach(e => {
    const loads = e.sets.filter(s => s.done && !isWarmupRow(s)).map(s => s.w).filter(w => w > 0)
    const mx = loads.length ? loads.reduce((a, b) => betterWeight(e.id, a, b)) : 0
    if (beatsWeight(e.id, mx, bestWeightFor(st, e.id, entryDbLoad(e)))) prs.push(e.id)
    const rec = is1RMRecord(st, e.id, e)
    if (rec && !prs.includes(e.id)) e1prs.push({ id: e.id, ...rec })
  })
  const w = buildCompletedWorkout(A, {
    end: past ? backfillEnd(A) : sessionEnd(A),
    prs,
    snapshotFor: e => isCustomEx(EXIDX[e.id]) ? exerciseMuscleSnapshot(EXIDX[e.id]) : null,
  })
  w.vol = workoutVolume(w)
  let shown = w
  update(s => {
    if (past) {
      stampWorkout(w)
      const replaced = A.backfill.replaceId ? s.workouts.find(x => x.id === A.backfill.replaceId) : null
      const touched = [...new Set([...(replaced?.entries || []), ...w.entries].map(e => e?.id).filter(id => id != null))]
      s.workouts = rebuildPrHistory(completeBackfill(s.workouts, A, w), touched, w)
      shown = s.workouts.find(x => x === w || (w.id != null && x.id === w.id)) || w
      prs.push(...[...(shown.prs || [])])
    } else {
      w.entries.forEach(e => {
        const mx = bestWeightForEntry(e)
        if (mx > 0 && beatsWeight(e.id, mx, (s.exWeights[e.id] || {}).w || 0)) s.exWeights[e.id] = { w: mx, d: w.d }
      })
      s.workouts.push(w)
    }
    s.active = null
    refillAfter(s, w)
  })
  ui().stopRest()
  ui().stopWork()
  beep(snd(), 880, 0.15); beep(snd(), 1100, 0.15, 0.18); beep(snd(), 1320, 0.3, 0.36)
  const result = { w: JSON.parse(JSON.stringify(shown)), prs, e1prs }
  // The summary takes the workout screen's place (it has no session to show any more).
  afterSheet(() => {
    const top = topPage()
    openPage(PAGES.finishSummary, result, { redirect: !!(top && top.route === WORKOUT_ROUTE) })
  })
  return result
}
