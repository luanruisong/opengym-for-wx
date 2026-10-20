// The running workout (frontend/src/views/Workout.jsx): Cards / List / Compact / Focus layouts,
// the header (name, clock, sets, ⋮, Finish), the exercise chips, Prev/Next, Add exercise, the
// session note and the finish button. With no workout running it is the start chooser.
//
// Each exercise is an <ex-block> (or <focus-view>) with its own store binding; this page only
// lays out the units. The clock is its own one-field setData once a second.
import { connectPage } from '../../utils/page.js'
import { navTo } from '../../utils/nav.js'
import { useStore } from '../../store/store.js'
import { useUI } from '../../store/ui.js'
import { exOr } from '../../lib/exercises.js'
import { supersetUnits, unitOf, setsDoneActive, setUnitsTotal, effectiveRoutines, effectiveRoutineIds } from '../../lib/history.js'
import { fmtDate, todayISO, exCount, DAYN } from '../../lib/format.js'
import { t, exerciseNameFor } from '../../lib/i18n.js'
import { fmtRest } from '../../lib/duration.js'
import { supersetMeta } from '../../lib/superset-meta.js'
import { exerciseChips } from '../lib/exercise-chips.js'
import { workoutControls } from '../../lib/workout-controls.js'
import { canMoveActiveWorkoutUnit } from '../lib/active-workout-order.js'
import { pinState } from '../../lib/queue.js'
import { glyphOf } from '../../lib/glyphs.js'
import { setKeepAwake } from '../../lib/wakelock.js'
import { sessionNoteSheet, finishWorkoutSheet } from '../../utils/sheets.js'
import { startFlow, finishWorkout, exitWorkoutEdit, discardWorkout } from '../../store/actions.js'
import * as W from './session.js'

const St = () => useStore.getState().S
const clock = start => {
  const s = Math.max(0, Math.floor((Date.now() - start) / 1000))
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}
const CARD_SWIPE_MIN = 70

// A superset's heading: its own name and rest between rounds when it has them (#292).
function ssTitle(entries, u) {
  const m = supersetMeta(entries, u, { onTarget: true })
  if (m.rest > 0) return t('{0} · back-to-back, {1} rest after each round', m.name || t('Superset'), fmtRest(m.rest))
  return m.name ? t('{0} · do these back-to-back, rest when done', m.name) : t('Superset · do these back-to-back, rest when done')
}

function chooserOf(S) {
  const iso = todayISO()
  const todayIds = effectiveRoutineIds(S, iso)
  const todayRoutines = effectiveRoutines(S, iso)
  const todayName = todayRoutines.map(r => r.name).join(' + ')
  const ovr = S.dayPlan && S.dayPlan[iso] !== undefined && pinState(S, S.dayPlan[iso]) !== 'done'
  const idSet = new Set(todayIds)
  return {
    sub: t(DAYN[new Date().getDay()]) + ' · ' + (todayRoutines.length ? t('today is {0}', todayName) : t('rest day, but no one’s stopping you')),
    today: todayRoutines.length ? {
      title: t("Today's plan") + (ovr ? ' · ' + t('rescheduled') : ''),
      name: todayName,
      count: exCount(todayRoutines.reduce((n, r) => n + r.ex.length, 0)),
      glyph: glyphOf(todayRoutines[0].emoji),
      start: t('Start {0}', todayName),
    } : null,
    others: S.routines.filter(r => !idSet.has(r.id)).map(r => ({ id: r.id, name: r.name, count: exCount(r.ex.length), glyph: glyphOf(r.emoji) })),
    noRoutines: !S.routines.length,
  }
}

Page(connectPage({
  data: { active: false, elapsed: '0:00', chipInto: '' },

  mapState(S, { ui }) {
    const resting = !!(ui.timer || ui.work)
    const A = S.active
    const awake = !!A && !A.editingWorkoutId && S.keepAwake !== false
    if (this._awake !== awake) { this._awake = awake; setKeepAwake(awake) }
    if (!A) {
      this._start = null
      return { active: false, resting, chooser: chooserOf(S) }
    }
    W.trackMarks(A)
    const editing = !!A.editingWorkoutId
    const { view, listMode, focusMode, dense } = W.viewOf(S)
    const units = supersetUnits(A.entries)
    const cur = Number.isInteger(A.cur) ? Math.min(Math.max(A.cur, 0), Math.max(0, A.entries.length - 1)) : 0
    const unit = A.entries.length ? unitOf(units, cur) : []
    const unitIdx = units.findIndex(u => u === unit)
    const isSuperset = unit.length > 1
    if (listMode && this._lastView !== view) this._scrollToCur()
    this._lastView = view
    const wc = workoutControls(S)
    const total = setUnitsTotal(A.entries)
    const done = setsDoneActive(A)
    const timeless = !!(A.backfill || editing)
    this._start = timeless ? null : A.start

    // Collapsed finished units in the list (#241), and the ones tapped open again.
    const collapseOn = W.collapseOnOf(S)
    if (!this._opened || this._opened.len !== A.entries.length) this._opened = { len: A.entries.length, keys: {} }
    const opened = this._opened.keys
    const finished = u => u.every(idx => A.entries[idx].sets.length > 0 && A.entries[idx].sets.every(s => s.done))
    const nameOf = idx => exerciseNameFor(exOr(A.entries[idx].id))

    const chips = wc.exerciseChips && A.entries.length
      ? exerciseChips(A.entries, cur).map(c => ({ key: c.key, n: c.n, state: c.state, cur: c.current, link: c.unit.length > 1, first: c.unit[0] }))
      : []
    const curChip = chips.find(c => c.cur)

    let listUnits = []
    if (listMode) {
      listUnits = units.map((u, k) => {
        const key = u.join('-')
        const multi = u.length > 1
        const isCur = u.includes(cur)
        const collapsed = collapseOn && !isCur && !opened[key] && finished(u)
        return {
          key, first: u[0], multi, isCur, collapsed,
          reopened: collapseOn && !isCur && !collapsed && !!opened[key] && finished(u),
          hd: multi ? t('Superset {0} / {1}', k + 1, units.length) : t('Exercise {0} / {1}', k + 1, units.length),
          ss: multi ? ssTitle(A.entries, u) : '',
          members: u.map((idx, j) => ({ idx, j })),
          summary: collapsed ? u.map(idx => ({ idx, name: nameOf(idx), sets: t('{0} sets', A.entries[idx].sets.length) })) : [],
          pairable: !multi,
        }
      })
    }

    const exDone = A.entries.filter(e => e.sets.length && e.sets.every(s => s.done)).length
    const allDone = A.entries.length > 0 && exDone === A.entries.length
    return {
      active: true,
      resting,
      editing,
      backfill: !!A.backfill,
      name: A.name,
      dateText: timeless ? fmtDate(A.d, true) : '',
      timeless,
      setsText: t('{0} sets', done + '/' + total),
      pct: total ? Math.round(done / total * 1000) / 10 : 0,
      view, listMode, focusMode, dense,
      empty: !A.entries.length,
      chips,
      chipInto: curChip ? 'wc-' + curChip.key : '',
      unitText: isSuperset ? t('Superset {0} / {1}', unitIdx + 1, units.length) : t('Exercise {0} / {1}', unitIdx + 1, units.length),
      listUnits,
      card: !listMode && A.entries.length ? {
        cur, multi: isSuperset, ss: isSuperset ? ssTitle(A.entries, unit) : '',
        members: unit.map((idx, j) => ({ idx, j })),
        unit,
        pairPrev: !isSuperset && cur > 0,
        pairNext: !isSuperset && cur < A.entries.length - 1,
      } : null,
      epoch: W.focusEpoch,
      prevDis: unitIdx <= 0,
      nextDis: unitIdx < 0 || unitIdx >= units.length - 1,
      exBtns: !!(wc.exerciseButtons && A.entries.length),
      exBtnsHint: wc.exerciseButtons && listMode && A.entries.length ? t('Move, swap and remove below act on the exercise marked {0}.', t('Current')) : '',
      busy: !!ui.work,
      moveUpDis: !!ui.work || !canMoveActiveWorkoutUnit(A, cur, -1),
      moveDownDis: !!ui.work || !canMoveActiveWorkoutUnit(A, cur, 1),
      hasNote: !!A.note,
      finishLabel: editing ? t('Save changes') : allDone ? t('Finish workout') : t('Finish workout early · {0} exercises', exDone + '/' + A.entries.length),
      finishPrimary: allDone,
    }
  },

  onLoad() {
    W.resetMarks()
    W.bindRestoredHold()
    W.hooks.revealCur = () => this._revealCur()
    W.hooks.onCurMoved = idx => this._centerMember(idx)
  },
  onShow() {
    this._tick()
    clearInterval(this._iv)
    this._iv = setInterval(() => this._tick(), 1000)
    clearTimeout(this._hintTm)
    this._hintTm = setTimeout(() => W.maybeSwipeHint(), 600)
    const A = St().active
    if (A && !A.editingWorkoutId && St().keepAwake !== false) { this._awake = true; setKeepAwake(true) }
  },
  onHide() {
    clearInterval(this._iv)
    clearTimeout(this._hintTm)
  },
  onUnload() {
    clearInterval(this._iv)
    clearTimeout(this._hintTm)
    W.clearRowUI()
    W.hooks.revealCur = null
    W.hooks.onCurMoved = null
    // The screen stays awake while a workout runs, minimised or not (App.jsx's useWakeLock).
    if (!St().active) setKeepAwake(false)
  },
  // The page's own clock (Elapsed): one small field a second.
  _tick() {
    if (!this._start) return
    const v = clock(this._start)
    if (v !== this.data.elapsed) this.setData({ elapsed: v })
  },

  // The list opens at the current exercise (#224): on the way in only (mapState).
  _afterRender(fn) { setTimeout(fn, 60) },
  _scrollToSel(sel, offset = 0) {
    wx.createSelectorQuery().select('.whdr').boundingClientRect().exec(res => {
      const h = (res && res[0] && res[0].height) || 0
      wx.pageScrollTo({ selector: sel, offsetTop: -(h + 8 + offset), duration: 250, fail() {} })
    })
  },
  _scrollToCur() { this._afterRender(() => this._scrollToSel('.wl-unit.cur')) },
  _revealCur() {
    if (!this.data.listMode) return
    this._afterRender(() => {
      wx.createSelectorQuery().select('.wl-unit.cur').boundingClientRect().select('.whdr').boundingClientRect().exec(res => {
        const el = res && res[0]
        if (!el) return
        const under = (res[1] && res[1].bottom) || 0
        const screen = wx.getWindowInfo ? wx.getWindowInfo().windowHeight : wx.getSystemInfoSync().windowHeight
        if (el.top >= under && el.top <= screen * 0.55) return
        this._scrollToSel('.wl-unit.cur')
      })
    })
  },
  // A superset tick moved the marker to the partner: bring its block on screen (cards).
  _centerMember(idx) {
    if (this.data.listMode) return
    this._afterRender(() => {
      wx.createSelectorQuery().select('#sx-' + idx).boundingClientRect().exec(res => {
        const el = res && res[0]
        if (!el) return
        const screen = wx.getWindowInfo ? wx.getWindowInfo().windowHeight : wx.getSystemInfoSync().windowHeight
        if (el.top >= 0 && el.bottom <= screen - 120) return
        wx.pageScrollTo({ selector: '#sx-' + idx, offsetTop: -80, duration: 250, fail() {} })
      })
    })
  },

  /* ---------- header ---------- */
  onMinimize() { navTo('/home') },
  onCloseEditor() { exitWorkoutEdit() },
  onMenu() { W.openViewMenu() },
  onFinishPill() {
    if (St().active && St().active.editingWorkoutId) finishWorkout()
    else finishWorkoutSheet({ onDiscard: discardWorkout })
  },
  onChip(e) {
    const key = e.mark.key
    const chip = (this.data.chips || []).find(c => c.key === key)
    if (!chip) return
    if (this.data.listMode) {
      const u = (this.data.listUnits || []).find(x => x.key === key)
      if (u && u.collapsed) this._openUnit(key, true)
      this._afterRender(() => this._scrollToSel('#u-' + key))
      return
    }
    if (chip.cur) return
    useStore.getState().update(s => { if (s.active) s.active.cur = chip.first })
  },

  /* ---------- list ---------- */
  _openUnit(key, open) {
    if (!this._opened) return
    if (open) this._opened.keys[key] = true
    else delete this._opened.keys[key]
    if (this.__refresh) this.__refresh()
  },
  onUnitOpen(e) { this._openUnit(e.mark.key, true) },
  onUnitFold(e) { this._openUnit(e.mark.key, false) },
  onSetCurrent(e) { W.focusUnit(Number(e.mark.first)) },
  onUnpair(e) { W.unpairAt(Number(e.mark.first)) },

  /* ---------- cards ---------- */
  onPrev() { if (!this.data.prevDis) W.navigateUnit(-1) },
  onNext() { if (!this.data.nextDis) W.navigateUnit(1) },
  onCardTouchStart(e) {
    const tch = e.touches && e.touches[0]
    this._cs = tch ? { x: tch.clientX, y: tch.clientY, at: Date.now() } : null
  },
  onCardTouchEnd(e) {
    const st = this._cs
    this._cs = null
    if (!st || this.data.listMode) return
    if (W.swipeGuard.at >= st.at) return   // the set row took this swipe
    const tch = e.changedTouches && e.changedTouches[0]
    if (!tch) return
    const dx = tch.clientX - st.x, dy = tch.clientY - st.y
    if (Math.abs(dx) < CARD_SWIPE_MIN || Math.abs(dy) > Math.abs(dx) * 0.5 || Date.now() - st.at > 800) return
    W.navigateUnit(dx < 0 ? 1 : -1)
  },

  /* ---------- below the session ---------- */
  onAddExercise() { W.addExercise() },
  onMoveUp() { if (!this.data.moveUpDis) W.moveCurrentUnit(-1) },
  onMoveDown() { if (!this.data.moveDownDis) W.moveCurrentUnit(1) },
  onSwap() { if (!this.data.busy) { const A = St().active; if (A) W.swapExercise(this.data.card ? this.data.card.cur : A.cur) } },
  onRemoveExercise() { if (!this.data.busy) W.removeExerciseSheet() },
  onSessionNote() { sessionNoteSheet() },
  onFinish() { finishWorkout() },

  /* ---------- start chooser ---------- */
  onStartToday() { startFlow(effectiveRoutineIds(St(), todayISO())) },
  onStartRoutine(e) { startFlow([e.mark.id]) },
  onFreestyle() { startFlow([]) },
  onBuildPlan() { navTo('/plan') },
}))
