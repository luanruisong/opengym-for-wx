// The app store: frontend/src/store/useStore.js without the server. The mini program is local
// only (the web app's guest mode): no sign-in, no sync, no pairing, no file mirror, no coach,
// no demo. What is left is the profile `S`, saved under `gym_state_v1` in wx storage, and the
// actions the screens use on it.
//
// `update(mut)` keeps the original's semantics: `mut` changes a deep copy of S, the change is
// stamped (lib/sync-merge.js stampChange: routine/workout edit times, removals, settings) so a
// backup taken here still merges correctly into the web app, and the copy is saved.
//
// Saving is debounced (SAVE_MS) and flushed when the app goes to the background. A copy too big
// for one storage key (wx limits a key to 1 MB) is split over several keys; see writeSaved.
import { create } from '../utils/create-store.js'
import { storage } from '../utils/storage.js'
import { registerCustom, healCustomEx } from '../lib/exercises.js'
import { refillIfComplete } from '../lib/rotation.js'
import { stampChange, highestStamp, stampRestore, stampReplace, inUnitOf, keepReset, resetIdsOf, mergeResetIds } from '../lib/sync-merge.js'
import { convertStateUnit } from '../lib/units.js'
import { saveWorkoutEdit, deleteEditedWorkout } from '../lib/session-edit.js'
import { DEFAULT_TEMPLATE_ID } from '../lib/structuralBalanceTemplates.js'
import { WC_DEFAULT } from '../lib/workout-controls.js'
import { sanitizeAccent } from '../lib/accent.js'
import { useUI, initUI } from './ui.js'

export const KEY = 'gym_state_v1'
const SAVE_MS = 400
// Characters per storage key when the copy is split. wx counts the limit (1 MB) in bytes; a
// character of a Chinese name is three, so this stays under it whatever the text is.
const CHUNK = 256 * 1024
const CHUNK_TAG = '@chunks:'

export const DEF = {
  unit: 'kg', restSec: 90, restPauseSec: 15, sound: true, soundOnSilent: false, vibrateOnSilent: false, timerFlash: false, timedSetOvertime: false, keepAwake: true, lang: 'zh',
  theme: 'dark', accent: 'lime', body: 'male', targetW: null,
  bodyweight: [], routines: [], week: {}, dayPlan: {},
  // A note per day off (#261): { [iso]: { tag, text, _ts } } (lib/day-notes.js).
  dayNotes: {},
  // Body measurements (#82): one check-in per day, values in cm (lib/measurements.js).
  measurements: [], measurementEnabled: null, customMeasurements: [],
  queue: null,   // a floating week (lib/queue.js), filled by the in-app rotation
  // The rotation's reusable definition — { id, sequence, label } (lib/rotation.js).
  rotation: null,
  // null | 'week' | 'rotation' — which scheduling screen Home/Plan show (scheduleModeOf).
  scheduleMode: null,
  exWeights: {}, workouts: [], active: null, customEx: [], gifSize: 'full',
  heatmapMetric: 'time',
  // 'cards' | 'list' | 'compact'; beginWorkout copies it onto s.active.
  workoutView: 'cards',
  collapseCompleted: false,
  exerciseView: 'list',
  wc: { ...WC_DEFAULT },
  // One-time hints already shown: { swipeSets: true }.
  hints: {},
  // effort: null | 'none' | 'rir' | 'rpe' (null falls back to the old showRir, see effortOf).
  reminder: { on: false, time: '08:00', tz: null, nudge: false, tone: 'friendly' }, effort: null, autoBackup: false,
  equipProfiles: [], activeEquipId: null, equipFilterOn: false,
  exNotes: {},
  favEx: [],
  weekStart: 1,
  wdec: 1,
  speedUnit: null,
  barWeights: {},
  plates: {},
  loadKind: {},
  dbLoad: {},
  dumbbells: {},
  gymCards: [],
  lastGymCardId: null,
  checkIn: true,
  showWeightCard: true,
  // Whether Start opens the quick weigh-in first (actions.js startFlow). A fresh profile starts off.
  weighIn: true,
  // Web-only connection banner flags, kept so a backup round-trips unchanged.
  connStatus: true,
  shareMap: true,
  connLocal: true,
  startFrom: 'plan',
  enParens: {},
  enOnly: {},
  logRef: 'last',
  balanceTemplate: DEFAULT_TEMPLATE_ID, balanceOverrides: {},
}
const clone = o => JSON.parse(JSON.stringify(o))

// A copy started from nothing on this device.
export function freshState() {
  const s = clone(DEF)
  s.lang = 'zh'
  s.langAuto = true
  s.weighIn = false
  s.gifSize = 'mini'
  return s
}

// A copy that starts over on this device (Reset everything): a new profile like freshState's.
export function restartedState(cur) {
  const s = freshState()
  if (cur?.lang) { s.lang = cur.lang; s.langAuto = cur.langAuto === true }
  return s
}

// Whether a copy holds anything of its own.
export const hasData = st => !!((st.workouts || []).length || (st.routines || []).length || (st.bodyweight || []).length || (st.customEx || []).length || (st.measurements || []).length)

/* ---------- storage: one key, or the copy split over several ---------- */

// The saved copy's JSON, put back together, or null.
function readSaved() {
  const head = storage.getItem(KEY)
  if (head == null) return null
  if (!head.startsWith(CHUNK_TAG)) return head
  const [gen, n] = head.slice(CHUNK_TAG.length).split(':')
  let out = ''
  for (let i = 0; i < Number(n); i++) {
    const part = storage.getItem(KEY + '_' + gen + '_' + i)
    if (part == null) return null
    out += part
  }
  return out
}

// Chunk keys of the copy the head names ([] for an unsplit one).
function chunkKeys(head) {
  if (!head || !head.startsWith(CHUNK_TAG)) return []
  const [gen, n] = head.slice(CHUNK_TAG.length).split(':')
  return Array.from({ length: Number(n) || 0 }, (_, i) => KEY + '_' + gen + '_' + i)
}

// Writes the copy. A big one goes into new chunk keys first and the head moves to them last, so
// a write that fails half way leaves the previous copy readable. True when it landed.
function writeSaved(json) {
  const prevHead = storage.getItem(KEY)
  let ok
  if (json.length <= CHUNK) {
    ok = storage.setItem(KEY, json)
  } else {
    const gen = Date.now().toString(36)
    const n = Math.ceil(json.length / CHUNK)
    ok = true
    for (let i = 0; i < n && ok; i++) ok = storage.setItem(KEY + '_' + gen + '_' + i, json.slice(i * CHUNK, (i + 1) * CHUNK))
    if (ok) ok = storage.setItem(KEY, CHUNK_TAG + gen + ':' + n)
    if (!ok) { for (let i = 0; i < n; i++) storage.removeItem(KEY + '_' + gen + '_' + i); return false }
  }
  if (ok) {
    const now = storage.getItem(KEY)
    if (prevHead !== now) chunkKeys(prevHead).forEach(k => storage.removeItem(k))
  }
  return ok
}

// The saved copy laid over DEF, with the repairs boot always made; a fresh profile when there
// is none (or it cannot be read).
function loadState() {
  try {
    const raw = readSaved()
    if (raw) {
      const saved = JSON.parse(raw)
      if (saved && typeof saved === 'object') {
        const s = sanitizeAccent(Object.assign(clone(DEF), saved))
        if (!saved.lang) s.lang = 'zh'
        return s
      }
    }
  } catch (e) { /* unreadable: start over below */ }
  return freshState()
}

export const useStore = create((set, get) => {
  let saveTm = null
  let toldNoRoom = false   // said once per streak of refused writes

  const save = () => {
    clearTimeout(saveTm)
    saveTm = null
    const S = get().S
    let ok = false
    try { ok = writeSaved(JSON.stringify(S)) } catch (e) { ok = false }
    if (ok) { toldNoRoom = false; return true }
    if (!toldNoRoom) {
      toldNoRoom = true
      try { useUI.getState().toast('存储空间已满：这次更改没有保存到本机。') } catch (e) { /* UI not up */ }
    }
    return false
  }
  // Writes a change still waiting in the debounce now (app to the background, tests).
  const flush = () => { if (saveTm) return save(); return true }

  // Every copy that enters the store goes through here: custom exercises healed and registered,
  // the copy put in place, the write scheduled. `stamp` gives it a new `_ts` (a real change).
  const persist = (S, stamp = true) => {
    if (stamp) S._ts = Math.max(Date.now(), Number(S._ts) || 0)
    S.customEx = healCustomEx(S.customEx)
    registerCustom(S.customEx)
    set({ S })
    clearTimeout(saveTm)
    saveTm = setTimeout(save, SAVE_MS)
  }

  // The running workout carried into a copy replacing this one, in that copy's unit.
  const carryActive = (from, to) => {
    const a = from?.active || null
    const fu = from?.unit || 'kg', tu = to?.unit || 'kg'
    return !a || fu === tu ? a : inUnitOf({ unit: fu, active: a }, to).active
  }

  let appHooked = false

  return {
    S: freshState(),
    // Local only: nobody is ever signed in.
    user: null,
    ready: false,
    // No server, so no instance config (the web app's /api/config); coach entry points read it.
    config: null,

    // Boot (app.js, once the exercise data is loaded): the saved copy from storage laid over
    // DEF, its custom exercises registered, and a rest or hold left running restored.
    init() {
      const S = loadState()
      S.customEx = healCustomEx(S.customEx)
      registerCustom(S.customEx)
      // A rotation pass left complete (e.g. a backup restored mid-pass) starts its next pass,
      // as the finish that completed it would have.
      const refilled = refillIfComplete(S)
      set({ S, ready: true })
      if (refilled) persist(clone(S))
      if (!appHooked && typeof wx !== 'undefined' && wx.onAppHide) {
        appHooked = true
        wx.onAppHide(() => flush())
      }
      try { initUI() } catch (e) { console.error(e) }
      return get().S
    },
    flush,

    // Mutate a draft of S, then stamp and save it. `push` is kept for the original signature.
    update(mut, push = true) {   // eslint-disable-line no-unused-vars
      const prev = get().S
      const S = clone(prev)
      mut(S)
      S._ts = stampChange(prev, S, Date.now())
      persist(S, false)
    },
    // An edit of a saved workout (lib/session-edit.js), saved or dropped like any other change.
    // A save that cannot happen throws before anything is written.
    saveHistoryEdit() {
      let saved = null
      get().update(S => { saved = saveWorkoutEdit(S) })
      return saved
    },
    discardHistoryEdit() { get().update(S => { S.active = null }) },
    // An edit that took out every set deletes the workout rather than saving it empty.
    deleteHistoryEdit() {
      let removed = false
      get().update(S => { removed = deleteEditedWorkout(S) })
      return removed
    },
    // Settings → unit. `convert` walks every stored weight into the new unit (lib/units.js);
    // off, only the label changes. Stamped (`unitSet`) as in the web app.
    setUnit(to, { convert = true } = {}) {
      const S0 = get().S
      if ((S0.unit || 'kg') === to) return null
      const S = clone(convert ? convertStateUnit(S0, to) : { ...S0, unit: to })
      S.unitSet = { at: Math.max(Date.now(), highestStamp(S0) + 1), convert }
      persist(S, true)
      return null
    },
    // Settings → Reset everything: a new profile, stamped with when (`resetAt`) and the ids of
    // every entry it wiped (`resetIds`), so a backup of it merges like the web app's reset.
    resetEverything() {
      const cur = get().S
      const S = restartedState(cur)
      S.resetAt = Math.max(Date.now(), highestStamp(cur) + 1)
      S.resetIds = mergeResetIds(cur.resetIds, resetIdsOf(cur))
      get().replaceState(S)
      return Promise.resolve()
    },
    // No server to hold other workouts: an import never conflicts with anything.
    async importConflict() { return null },
    // A backup in place of this copy, as a deliberate add-back (stampRestore) and a replace of
    // what was here (stampReplace). A workout running here is kept (in the backup's unit); with
    // none running, a backup taken mid-workout brings its own session back.
    importBackup(backup) {
      const cur = get().S
      const now = Math.max(Date.now(), highestStamp(cur) + 1, highestStamp(backup) + 1)
      const next = sanitizeAccent(Object.assign(clone(DEF), backup))
      const running = carryActive(cur, next) || next.active || null
      stampRestore(next, [cur], now)
      stampReplace(next, [cur], now)
      next._ts = now
      next.active = running
      refillIfComplete(next)
      get().replaceState(next)
    },
    // A wholesale replace (backup import, reset). Never takes the reset stamp back (keepReset).
    replaceState(S) {
      persist(keepReset(get().S, clone(S)), false)
    },
    // The phone app's automatic backup file; nothing to do here.
    autoBackupNow() {},

    // Local only: always the web app's guest.
    isGuest: () => true,
    setGuest() {},
  }
})
