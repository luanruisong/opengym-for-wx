// Transient UI state, ported from frontend/src/store/useUI.js: toasts (with an optional action such
// as Undo), the rest countdown between sets, the hold countdown of a timed set, the timer flash and
// the one-time swipe hint. Sheets are pages in the mini program (utils/sheets.js), so there is no
// sheet stack here; there is no server push and no native alarm either.
//
// Every countdown is computed from its `endsAt` timestamp, never by counting ticks, so a mini
// program suspended in the background picks up exactly where the clock says on its next tick
// (onAppShow runs one at once).
import { create } from '../utils/create-store.js'
import { storage } from '../utils/storage.js'
import { beep, chime, vibrate, alertBuzz } from '../lib/sound.js'
import { restSoundOf } from '../lib/rest-sounds.js'
import { t } from '../lib/i18n.js'
import { REST_MAX } from '../lib/duration.js'
import { useStore } from './store.js'   // circular: only read inside functions

// Whether the app is in the background, and when it went there. A countdown that reaches zero
// while hidden (or on the first tick after coming back) ends without beep, buzz or flash: nobody
// was there for it. The toast still shows, so a vanished countdown does not look like a bug.
let appHidden = false
let pageHiddenAt = null

let toastTm = null
const TOAST_MS = 2200
const TOAST_ACTION_MS = 5000
let toastLeft = 0
let toastT0 = 0
let toastPaused = false
let toastSeq = 0
const runToast = set => {
  toastPaused = false
  toastT0 = Date.now()
  clearTimeout(toastTm)
  toastTm = setTimeout(() => set({ toastMsg: '', toastAction: null }), toastLeft)
}
let timerInt = null
let timerTick = null
let workInt = null
let workTick = null
let workDone = null
const MAX_WORK_OVERTIME_SEC = 15 * 60

const S = () => useStore.getState().S || {}

// The end of a rest or a hold, on screen.
function endTone(enabled, kind) {
  if (!enabled) return
  chime(enabled, kind)
}

// The hold's countdown tick, from a start or from a restore after a restart.
const runWork = (set, get) => {
  stopWorkTicking()
  workTick = () => {
    const wk = get().work
    if (!wk) return
    const left = Math.max(wk.overtime ? -MAX_WORK_OVERTIME_SEC : 0, Math.round((wk.endsAt - Date.now()) / 1000))
    const seenLive = !appHidden && pageHiddenAt === null
    if (!appHidden) pageHiddenAt = null
    if (left === wk.left) return
    const st = S()
    const snd = st.sound, endSound = restSoundOf(st)
    if (left <= 0) {
      if (seenLive && !wk.alerted) {
        endTone(snd, endSound)
        alertBuzz([200, 100, 200]); get().flashTimer()
      }
      if (wk.overtime && left > -MAX_WORK_OVERTIME_SEC) { set({ work: { ...wk, left, alerted: true } }); return }
      const done = workDone || ownerDone(wk)
      get().stopWork()
      // `chimed`: this end already sounded and buzzed (not so when overtime ran out).
      if (done) done(wk.total - left, { chimed: seenLive && !wk.alerted })
      return
    }
    if (left <= 3) beep(snd, 660, 0.1)
    set({ work: { ...wk, left } })
  }
  workInt = setInterval(workTick, 1000)
}
const stopWorkTicking = () => {
  if (workInt) clearInterval(workInt)
  workInt = null
  workTick = null
}
// The set a hold belongs to, while it still is that one: same exercise at that place in the
// running workout, not ticked off yet.
const ownerSet = o => {
  const e = S()?.active?.entries?.[o?.idx]
  const st = e && e.id === o.id ? e.sets?.[o.i] : null
  return st && !st.done ? st : null
}
// A restored hold that ends before the workout screen binds its handler: the time still goes to
// its set, and a hold that ran out ticks the set off. No rest follows.
const ownerDone = wk => !wk?.owner ? null : (elapsed, { abandoned = false } = {}) => {
  if (!ownerSet(wk.owner)) return
  const { idx, i } = wk.owner
  useStore.getState().update(s => {
    const st = s.active.entries[idx].sets[i]
    st.sec = elapsed
    if (abandoned) { if (st.planSec == null) st.planSec = wk.total; return }
    delete st.planSec
    if (st.sides) return   // a per-side row is ticked side by side, on the workout screen
    st.done = true
    st.at = Date.now()
  }, true)
}
const stopRestTicking = () => {
  if (timerInt) clearInterval(timerInt)
  timerInt = null
  timerTick = null
}
// The rest countdown's tick, from a start or a resume: the same endsAt-based count either way.
const runRest = (set, get) => {
  stopRestTicking()
  timerTick = () => {
    const tm = get().timer
    if (!tm || tm.ready || tm.paused) return
    const left = Math.max(0, Math.round((tm.endsAt - Date.now()) / 1000))
    const seenLive = !appHidden && pageHiddenAt === null
    if (!appHidden) pageHiddenAt = null
    if (left === tm.left) return
    const st = S()
    const snd = st.sound, endSound = restSoundOf(st)
    if (left <= 0 && tm.kind === 'switch') {
      // Over like a hold is: chime and buzz, then the bar goes. No "Ready", no toast.
      if (seenLive) { endTone(snd, endSound); alertBuzz([200, 100, 200]); get().flashTimer() }
      stopRestTicking()
      set({ timer: null })
      return
    }
    if (left <= 0) {
      if (seenLive) {
        endTone(snd, endSound)
        alertBuzz([200, 100, 200]); get().flashTimer()
      }
      // The toast stays even when the rest ran out while hidden; only the loud parts are gated.
      get().toast(t('Rest’s over. Next set!'))
      stopRestTicking()
      set({ timer: { ...tm, left: 0, ready: true } })
      return
    }
    if (left <= 3) beep(snd, 660, 0.1)
    set({ timer: { ...tm, left } })
  }
  timerInt = setInterval(timerTick, 1000)
}

export const useUI = create((set, get) => ({
  toastMsg: '',
  toastAction: null,   // { label, run, id } while the toast offers an action (Undo)
  swipeHint: null,     // { idx, i, id }: the set row showing the one-time swipe hint
  setFlash: null,      // { idx, i, id }: the set row a copy or an undo just brought, flashed once
  timer: null,         // rest countdown — { left, total, endsAt, forIdx, forSet?, ready?, paused?, kind? }
                       // kind 'switch': the short pause between the two sides of a timed set
                       // paused: held at `left`; `endsAt` means nothing until resumeRest sets it
  work: null,          // hold countdown of a timed set — { left, total, endsAt, label, overtime?, alerted?, owner? }
  timerFlashId: 0,     // changing the id retriggers the theme-blink visual alert

  flashTimer() {
    if (!S().timerFlash) return
    set(s => ({ timerFlashId: s.timerFlashId + 1 }))
  },

  // 2.2 s of text; with an action (`{ action: 'Undo', onAction }`) 5 s with a button that holds
  // still while pressed (pauseToast). A new toast replaces the one showing, action and all.
  toast(msg, { action, onAction, ms } = {}) {
    const withAction = !!(action && typeof onAction === 'function')
    clearTimeout(toastTm)
    toastLeft = ms || (withAction ? TOAST_ACTION_MS : TOAST_MS)
    toastSeq += 1
    set({ toastMsg: msg, toastAction: withAction ? { label: action, run: onAction, id: toastSeq } : null })
    runToast(set)
  },
  runToastAction() {
    const act = get().toastAction
    if (!act) return
    clearTimeout(toastTm)
    set({ toastMsg: '', toastAction: null })
    act.run()
  },
  pauseToast() {
    if (!get().toastAction || toastPaused) return
    toastPaused = true
    clearTimeout(toastTm)
    toastLeft = Math.max(400, toastLeft - (Date.now() - toastT0))
  },
  resumeToast() {
    if (!toastPaused) return
    toastPaused = false
    if (get().toastMsg) runToast(set)
  },

  startRest(sec, forIdx, { kind, forSet } = {}) {
    get().stopRest()
    // Rest timer set to Off: nothing starts.
    if (!(sec > 0)) return
    // A rest and a hold never run together; what the hold held is kept (abandonWork).
    get().abandonWork()
    // Each timer starts from where the app is now, not from a stale hide.
    pageHiddenAt = appHidden ? Date.now() : null
    const endsAt = Date.now() + sec * 1000
    set({ timer: { left: sec, total: sec, endsAt, forIdx, ...(forSet != null ? { forSet } : {}), ...(kind === 'switch' ? { kind } : {}) } })
    runRest(set, get)
  },
  // Holding the rest where it is (#193). Paused time does not count.
  pauseRest() {
    const tm = get().timer
    if (!tm || tm.ready || tm.paused) return
    stopRestTicking()
    const left = Math.max(1, Math.round((tm.endsAt - Date.now()) / 1000))
    set({ timer: { ...tm, left, paused: true } })
  },
  // Carrying on from the pause: the end moves out by however long the pause was.
  resumeRest() {
    const tm = get().timer
    if (!tm?.paused) return
    const { paused, ...rest } = tm
    pageHiddenAt = appHidden ? Date.now() : null
    const endsAt = Date.now() + tm.left * 1000
    set({ timer: { ...rest, endsAt } })
    runRest(set, get)
  },
  addRest(sec) {
    const tm = get().timer
    if (!tm) return
    if (tm.ready) { if (sec > 0) get().startRest(Math.min(sec, REST_MAX), tm.forIdx, { forSet: tm.forSet }); else get().stopRest(); return }
    // +15 s stops where the wheel does (15:00).
    if (sec > 0) sec = Math.min(sec, Math.max(0, REST_MAX - tm.left))
    if (!sec) return
    const left = tm.left + sec
    // Taking off more than is left means "ready now", same as skipping.
    if (left <= 0) { get().stopRest(); return }
    const total = Math.max(tm.total || left, left)
    if (tm.paused) { set({ timer: { ...tm, left, total } }); return }
    const endsAt = tm.endsAt + sec * 1000
    set({ timer: { ...tm, left, total, endsAt } })
  },
  // The active list changed shape (an exercise removed or inserted at `at`): keep the rest
  // pointing at the same exercise.
  shiftRestOwner(at, delta) {
    const tm = get().timer
    if (!tm || !(tm.forIdx >= at)) return
    set({ timer: { ...tm, forIdx: tm.forIdx + delta } })
  },
  stopRest() {
    stopRestTicking()
    set({ timer: null })
  },

  /* ---- work timer (issue #16) ----
     Times the set itself. `onDone(elapsedSec, { chimed, abandoned })` runs at zero and on an early
     finish; the elapsed time is what gets logged. `owner` ({ idx, i, id }) lets a hold outlive an
     app restart (restoreWork); the workout page binds its handler again with bindWork. */
  startWork(sec, label, onDone, owner = null) {
    get().abandonWork()
    get().stopRest()
    const total = Math.max(1, Math.round(sec) || 1)
    const endsAt = Date.now() + total * 1000
    workDone = onDone
    pageHiddenAt = appHidden ? Date.now() : null
    set({ work: { left: total, total, endsAt, label, overtime: S().timedSetOvertime === true, ...(owner ? { owner } : {}) } })
    runWork(set, get)
  },
  // The workout page, back on a restored hold: `make(work)` gives it the handler its own start would have.
  bindWork(make) {
    const wk = get().work
    if (!wk?.owner || workDone || !ownerSet(wk.owner)) return
    workDone = make(wk)
  },
  // Ended the hold early — log what was actually held.
  finishWorkEarly() {
    const wk = get().work
    if (!wk) return
    const startedAt = wk.endsAt - wk.total * 1000
    const elapsed = Math.max(1, Math.min(wk.total + (wk.overtime ? MAX_WORK_OVERTIME_SEC : 0), Math.round((Date.now() - startedAt) / 1000)))
    const done = workDone || ownerDone(wk)
    vibrate(30)
    get().stopWork()
    if (done) done(elapsed)
  },
  // A rest displaces a running hold: the time it held goes back to its row (`abandoned`), unless
  // it was under two seconds (a tap by accident).
  abandonWork() {
    const wk = get().work
    if (!wk) { get().stopWork(); return }
    const elapsed = wk.total - wk.left
    const done = workDone || ownerDone(wk)
    get().stopWork()
    if (done && elapsed >= 2) done(elapsed, { abandoned: true })
  },
  // Abandon without logging anything.
  stopWork() {
    stopWorkTicking()
    workDone = null
    set({ work: null })
  },
}))

/* ---- surviving an app restart ----
   A rest still ahead comes back (held if it was paused); one that ended meanwhile, or one with no
   workout running, is dropped. A hold the same way, with the set it belongs to; one that ended
   while the app was gone is written to its set as held to the end. */
export const REST_KEY = 'gym_rest'
const saveRest = tm => {
  if (!tm || tm.ready) storage.removeItem(REST_KEY)
  else storage.setItem(REST_KEY, JSON.stringify({ endsAt: tm.endsAt, total: tm.total, forIdx: tm.forIdx ?? null, forSet: tm.forSet ?? null, kind: tm.kind || null, paused: !!tm.paused, left: tm.left }))
}
export function restoreRest(now = Date.now()) {
  let saved = null
  try { saved = JSON.parse(storage.getItem(REST_KEY) || 'null') } catch (e) { saved = null }
  if (!saved || useUI.getState().timer) return false
  const total = Math.round(Number(saved.total))
  const ok = S()?.active && total > 0 && (saved.paused ? saved.left > 0 : saved.endsAt > now)
  if (!ok) { storage.removeItem(REST_KEY); return false }
  const base = { total, forIdx: saved.forIdx ?? undefined, ...(saved.forSet != null ? { forSet: saved.forSet } : {}), ...(saved.kind === 'switch' ? { kind: 'switch' } : {}) }
  if (saved.paused) {
    useUI.setState({ timer: { ...base, left: Math.round(saved.left), endsAt: saved.endsAt, paused: true } })
    return true
  }
  pageHiddenAt = appHidden ? now : null
  useUI.setState({ timer: { ...base, left: Math.max(1, Math.round((saved.endsAt - now) / 1000)), endsAt: saved.endsAt } })
  runRest(useUI.setState, useUI.getState)
  return true
}
useUI.subscribe((s, prev) => { if (s.timer !== prev.timer) saveRest(s.timer) })

export const WORK_KEY = 'gym_work'
const saveWork = wk => {
  if (!wk?.owner) storage.removeItem(WORK_KEY)
  else storage.setItem(WORK_KEY, JSON.stringify({ endsAt: wk.endsAt, total: wk.total, label: wk.label || '', overtime: !!wk.overtime, alerted: !!wk.alerted, owner: wk.owner }))
}
export function restoreWork(now = Date.now()) {
  let saved = null
  try { saved = JSON.parse(storage.getItem(WORK_KEY) || 'null') } catch (e) { saved = null }
  if (!saved || useUI.getState().work) return false
  const total = Math.round(Number(saved.total))
  const drop = () => { storage.removeItem(WORK_KEY); return false }
  if (!(total > 0) || !(saved.endsAt > 0) || !ownerSet(saved.owner)) return drop()
  const wk = { left: total, total, endsAt: saved.endsAt, label: saved.label || '', overtime: !!saved.overtime, ...(saved.alerted ? { alerted: true } : {}), owner: saved.owner }
  const left = Math.round((saved.endsAt - now) / 1000)
  // Over while the app was away: held to the end, with no chime.
  if (left <= 0 && !(wk.overtime && left > -MAX_WORK_OVERTIME_SEC)) {
    drop()
    ownerDone(wk)(total)
    return true
  }
  pageHiddenAt = appHidden ? now : null
  useUI.setState({ work: { ...wk, left, ...(left <= 0 ? { alerted: true } : {}) } })
  runWork(useUI.setState, useUI.getState)
  return true
}
useUI.subscribe((s, prev) => { if (s.work !== prev.work && (!s.work || !prev.work || s.work.owner !== prev.work.owner || s.work.endsAt !== prev.work.endsAt || s.work.alerted !== prev.work.alerted)) saveWork(s.work) })

// Called once by store.init() after the saved state is loaded: background tracking (the
// replacement of the web app's visibilitychange) and the restore of a rest or hold in progress.
let uiInited = false
export function initUI() {
  if (!uiInited) {
    uiInited = true
    if (typeof wx !== 'undefined' && wx.onAppHide && wx.onAppShow) {
      wx.onAppHide(() => { appHidden = true; pageHiddenAt = Date.now() })
      wx.onAppShow(() => {
        appHidden = false
        if (timerTick) timerTick()
        if (workTick) workTick()
      })
    }
  }
  restoreRest()
  restoreWork()
}

// Tests only: stop every timer and forget the background state.
export function __resetUIForTest() {
  stopRestTicking()
  stopWorkTicking()
  workDone = null
  clearTimeout(toastTm)
  toastPaused = false
  appHidden = false
  pageHiddenAt = null
  useUI.setState({ toastMsg: '', toastAction: null, swipeHint: null, setFlash: null, timer: null, work: null, timerFlashId: 0 })
}
