// <focus-view idx="{{cur}}" unit="{{[3,4]}}" epoch="{{n}}" pairprev pairnext />  — the Focus
// layout of the running workout (frontend/src/views/FocusView.jsx): one set at a time, big
// steppers, Complete, Skip, a dot per set. Which set each exercise shows is this view's own
// memory (`pointers`), dropped whenever the session's order changes (`epoch`).
import { connectComponent } from '../../../utils/page.js'
import { useStore } from '../../../store/store.js'
import { useUI } from '../../../store/ui.js'
import { exOr } from '../../../lib/exercises.js'
import { inclineFits, hasIncline, clampIncline, INCLINE_MAX, INCLINE_STEP } from '../../../lib/incline.js'
import { t, exerciseNameFor } from '../../../lib/i18n.js'
import { fmtDate, fmtNum } from '../../../lib/format.js'
import { EFFORT, effortOf, modeOf, lastEntryFor, pinnedNoteFor } from '../../../lib/history.js'
import { effortColor, rirOf } from '../../../lib/effort.js'
import { progressionGuidance } from '../../lib/progression-copy.js'
import {
  clustersOf, dropsOf, isFailureSet, isSideSet, isWarmupRow, toggleFailure, setClusterAt, setDropAt,
  setSideClusterAt, setSideDropAt, setSideField,
} from '../../../lib/workout-model.js'
import { weightIncrement, stepWeight } from '../../../lib/progression.js'
import { speedUnitOf, toSpeed, fromSpeed } from '../../../lib/speed.js'
import { ownedWeightsFor, stepOwned } from '../../../lib/dumbbells.js'
import { effortPickerSheet, exerciseDetailSheet, exerciseHistorySheet, exerciseNoteSheet, menuSheet, barWeightSheet } from '../../../utils/sheets.js'
import { firstIncomplete, clampSet, supersetSequence, toggleWarmup, addDropTo, addBurstTo, prescriptionBadges, planBadge, plateBadge } from '../../workout/focus-model.js'
import * as W from '../../workout/session.js'

const St = () => useStore.getState().S
const num = v => (v == null || v === '' ? 0 : Number(v))

function buildFocus(S, ui) {
  const A = S.active
  const p = this.properties
  const entryIdx = p.idx
  const entry = A && A.entries[entryIdx]
  if (!entry || !entry.sets.length) { this._cur = null; return { fv: null } }
  if (!this._ptr || this._ptr.epoch !== p.epoch) this._ptr = { epoch: p.epoch, map: {} }
  const stored = this._ptr.map[entryIdx]
  const setIdx = clampSet(entry, Number.isInteger(stored) ? stored : firstIncomplete(entry))
  const set = entry.sets[setIdx]
  const firstOpen = firstIncomplete(entry)
  const locked = !set.done && setIdx > firstOpen
  const readOnly = !!set.done || locked
  const ex = exOr(entry.id)
  const cfg = { ...(entry.target || {}), id: entry.id }
  const mode = modeOf(cfg)
  const effort = effortOf(S)
  const effortField = EFFORT[effort] ? EFFORT[effort].f : null
  const effortValue = effortField && set[effortField] != null ? set[effortField] : null
  const tint = effortValue == null ? null : effortColor(rirOf({ [effortField]: effortValue }))
  const owned = mode === 'reps' ? ownedWeightsFor(S, cfg) : null
  const unit = p.unit && p.unit.length ? p.unit : [entryIdx]
  const sequence = unit.length > 1 ? supersetSequence(A.entries, unit) : []
  const seqIdx = sequence.findIndex(it => it.entryIdx === entryIdx && it.setIdx === setIdx)
  const last = lastEntryFor(S, entry.id)
  const pinned = pinnedNoteFor(S, entry.id)
  const guidance = progressionGuidance(entry.plan)
  const speedUnit = speedUnitOf(S)
  const pres = prescriptionBadges(entry, setIdx, S.unit, S.restSec)
  const drops = dropsOf(set).length ? dropsOf(set) : Array.isArray(set.drops) ? set.drops : []
  const bursts = clustersOf(set).length ? clustersOf(set) : Array.isArray(set.clusters) ? set.clusters : []
  const sideVM = side => {
    const sd = set.sides[side]
    const sDrops = dropsOf(sd).length ? dropsOf(sd) : Array.isArray(sd.drops) ? sd.drops : []
    const sBursts = clustersOf(sd).length ? clustersOf(sd) : Array.isArray(sd.clusters) ? sd.clusters : []
    return {
      side, label: side === 'L' ? t('Left') : t('Right'), done: !!sd.done, dis: readOnly || !!sd.done,
      w: sd.w || 0, r: sd.r || 0,
      drops: sDrops.map((d, k) => ({ k, label: t('Drop {0}', k + 1), w: d.w || 0, r: d.r || 0 })),
      bursts: sBursts.map((b, k) => ({ k, label: t('Burst {0}', k + 1), r: b.r || 0, rest: b.restSec + 's' })),
    }
  }
  this._cur = { entryIdx, setIdx, set, entry, mode, effort, effortField, effortValue, sequence, seqIdx, unit, owned, cfg, speedUnit }
  const side = isSideSet(set)
  return {
    fv: {
      ss: unit.length > 1 ? {
        names: t('Superset:') + ' ' + unit.map(i => exerciseNameFor(exOr(A.entries[i].id))).join(' + '),
        where: t('Round {0}', setIdx + 1) + ' · ' + t('Exercise {0} of {1}', unit.indexOf(entryIdx) + 1, unit.length),
        prevDis: seqIdx <= 0, nextDis: seqIdx < 0 || seqIdx >= sequence.length - 1,
      } : null,
      name: exerciseNameFor(ex),
      warm: isWarmupRow(set),
      fail: isFailureSet(set),
      tags: [
        mode === 'cardio' && { k: 'c', text: t('Cardio'), acc: true },
        side && { k: 's', text: t('Per side'), acc: true },
        (ex.tg || ex.bp) && { k: 'm', text: t(ex.tg || ex.bp) },
        ex.eq && { k: 'e', text: t(ex.eq) },
      ].filter(Boolean),
      targetNote: (entry.target && entry.target.note) || '',
      pinned: pinned ? t('From {0}:', fmtDate(pinned.d, true)) + ' ' + pinned.note : '',
      note: entry.note || '',
      last: last ? t('Last time') + ' · ' + fmtDate(last.d) : '',
      guidance: guidance ? t(guidance.policyLabel) : '',
      progress: pres.progress,
      badges: pres.badges.map((text, k) => ({ k, text })),
      plan: planBadge(entry, mode),
      plate: plateBadge(S, entry, set),
      noProg: entry.noProg === true,
      noProgUndo: W.canNoProg(S, entryIdx),
      lockNote: locked ? t('Complete set {0} to edit this one.', firstOpen + 1) : '',
      done: !!set.done, locked, readOnly,
      side,
      sides: side ? [sideVM('L'), sideVM('R')] : [],
      cardio: mode === 'cardio',
      timed: mode === 'time',
      loadLabel: t('Load ({0})', S.unit),
      speedLabel: speedUnit === 'mph' ? t('Speed (mph)') : t('Speed (km/h)'),
      min: set.min || 0,
      speed: toSpeed(set.speed || 0, speedUnit),
      incline: (inclineFits(ex) || entry.sets.some(hasIncline)),
      inclineV: set.incline || 0,
      inclineMax: INCLINE_MAX,
      inclineStep: INCLINE_STEP,
      w: set.w || 0,
      r: set.r || 0,
      hold: t('{0}s hold', set.sec || (entry.target && entry.target.sec) || 45),
      goDis: readOnly || !!ui.work,
      loadStep: weightIncrement(cfg, S.unit),
      drops: drops.map((d, k) => ({ k, label: t('Drop {0}', k + 1), w: d.w || 0, r: d.r || 0 })),
      bursts: bursts.map((b, k) => ({ k, label: t('Burst {0}', k + 1), r: b.r || 0, rest: b.restSec + 's' })),
      effort: mode === 'reps' && effortField ? {
        empty: effortValue == null,
        text: effortValue == null ? t(EFFORT[effort].hd) : fmtNum(effortValue),
        style: tint ? 'color:' + tint + ';border-color:' + tint : '',
      } : null,
      completeLabel: set.done ? t('Completed') : t('Complete'),
      skipDis: setIdx >= entry.sets.length - 1,
      dots: entry.sets.map((row, k) => ({ k, active: k === setIdx, done: !!row.done })),
      prevDis: setIdx === 0,
      nextDis: setIdx === entry.sets.length - 1,
    },
  }
}

Component(connectComponent({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    idx: { type: Number, value: 0 },
    unit: { type: Array, value: [] },
    epoch: { type: Number, value: 0 },
    pairprev: { type: Boolean, value: false },
    pairnext: { type: Boolean, value: false },
  },
  data: { fv: null },
  observers: {
    'idx, unit, epoch'() { if (this.__refresh) this.__refresh() },
  },
  mapState(S, { ui }) {
    const A = S.active
    const p = this.properties
    const memoKey = [p.idx, JSON.stringify(p.unit), p.epoch, p.pairprev, p.pairnext, !!ui.work, this._ptrRev || 0].join("|")
    if (this._memo && this._memo.S === S && this._memo.key === memoKey) return this._memo.out
    const out = buildFocus.call(this, S, ui)
    this._memo = { S, key: memoKey, out }
    return out
  },
  methods: {
    _select(index) {
      const c = this._cur
      if (!c) return
      this._ptr.map[c.entryIdx] = clampSet(c.entry, index)
      this._ptrRev = (this._ptrRev || 0) + 1
      this.__refresh()
    },
    _clear(entryIdx) {
      if (this._ptr && this._ptr.map[entryIdx] != null) { delete this._ptr.map[entryIdx]; this._ptrRev = (this._ptrRev || 0) + 1; this.__refresh() }
    },
    // After a set is logged: the next set, the next superset member, or the next unit.
    _progress() {
      const c = this._cur
      if (!c) return () => {}
      const { entryIdx, setIdx, unit } = c
      return ({ unitDone }) => {
        const active = St().active
        if (!active) return
        if (unitDone) {
          W.advanceFocusUnit()
          const next = St().active && St().active.cur
          if (next !== entryIdx) this._clear(next)
        } else if (unit.length === 1) this._select(setIdx + 1)
        else this._clear(active.cur)
      }
    },
    _mut(fn) { const c = this._cur; if (c) W.mutSet(c.entryIdx, c.setIdx, fn) },
    _field(f, v) { const c = this._cur; if (c) W.setField(c.entryIdx, c.setIdx, f, v) },

    onSeqPrev() { this._seq(-1) },
    onSeqNext() { this._seq(1) },
    _seq(d) {
      const c = this._cur
      const it = c && c.sequence[c.seqIdx + d]
      if (!it) return
      this._ptr.map[it.entryIdx] = it.setIdx
      this._ptrRev = (this._ptrRev || 0) + 1
      W.selectEntry(it.entryIdx)
    },
    onUnpair() { const c = this._cur; if (c) W.unpairAt(c.entryIdx) },
    onDetails() { const c = this._cur; if (c) exerciseDetailSheet(exOr(c.entry.id)) },
    onGuidance() { const c = this._cur; if (c) W.openProgressionSettings(c.entryIdx) },
    onNoProgUndo() { const c = this._cur; if (c) W.setNoProg(c.entryIdx, false) },

    onMin(e) { this._field('min', num(e.detail.value)) },
    onSpeed(e) { const c = this._cur; if (c) this._field('speed', fromSpeed(num(e.detail.value), c.speedUnit)) },
    onIncline(e) { this._field('incline', clampIncline(num(e.detail.value))) },
    onLoad(e) { this._field('w', num(e.detail.value)) },
    onLoadStep(e) { const c = this._cur; if (c) this._field('w', this._stepLoad(e.detail.value, e.detail.step, e.detail.dir)) },
    _stepLoad(v, step, dir) { const c = this._cur; return c && c.owned ? stepOwned(c.owned, v, dir) : stepWeight(v, step, dir) },
    onReps(e) { this._field('r', num(e.detail.value)) },
    onStart() {
      const c = this._cur
      if (!c || this.data.fv.goDis) return
      W.startTimed(c.entryIdx, c.setIdx, this._progress())
    },
    onDropW(e) { const k = Number(e.mark.k); const v = num(e.detail.value); this._mut(row => setDropAt(row, k, { w: v })) },
    onDropWStep(e) { const k = Number(e.mark.k); const v = this._stepLoad(e.detail.value, e.detail.step, e.detail.dir); this._mut(row => setDropAt(row, k, { w: v })) },
    onDropR(e) { const k = Number(e.mark.k); const v = num(e.detail.value); this._mut(row => setDropAt(row, k, { r: v })) },
    onBurstR(e) {
      const k = Number(e.mark.k); const value = num(e.detail.value)
      this._mut(row => {
        const before = (clustersOf(row)[k] && clustersOf(row)[k].r) != null ? clustersOf(row)[k].r : ((row.clusters && row.clusters[k] && row.clusters[k].r) || 0)
        const delta = value - before
        return { ...setClusterAt(row, k, { r: value }), r: Math.max(0, (row.r || 0) + delta) }
      })
    },
    // one side of a unilateral set
    onSideW(e) { const s = e.mark.side; const v = num(e.detail.value); this._mut(row => setSideField(row, s, 'w', v)) },
    onSideWStep(e) { const s = e.mark.side; const v = this._stepLoad(e.detail.value, e.detail.step, e.detail.dir); this._mut(row => setSideField(row, s, 'w', v)) },
    onSideR(e) { const s = e.mark.side; const v = num(e.detail.value); this._mut(row => setSideField(row, s, 'r', v)) },
    onSideDropW(e) { const s = e.mark.side, k = Number(e.mark.k); const v = num(e.detail.value); this._mut(row => setSideDropAt(row, s, k, { w: v })) },
    onSideDropWStep(e) { const s = e.mark.side, k = Number(e.mark.k); const v = this._stepLoad(e.detail.value, e.detail.step, e.detail.dir); this._mut(row => setSideDropAt(row, s, k, { w: v })) },
    onSideDropR(e) { const s = e.mark.side, k = Number(e.mark.k); const v = num(e.detail.value); this._mut(row => setSideDropAt(row, s, k, { r: v })) },
    onSideBurstR(e) { const s = e.mark.side, k = Number(e.mark.k); const v = num(e.detail.value); this._mut(row => setSideClusterAt(row, s, k, v)) },
    onSideCheck(e) {
      const c = this._cur
      if (!c) return
      const s = e.mark.side
      const set = c.set
      const finishing = !set.sides[s].done && (set.sides.L.done || set.sides.R.done)
      W.toggle(c.entryIdx, c.setIdx, s, { onFocusProgress: finishing ? this._progress() : undefined })
    },

    onEffort() {
      const c = this._cur
      if (!c || !c.effortField || this.data.fv.readOnly) return
      const f = c.effortField
      const { entryIdx, setIdx } = c
      effortPickerSheet(c.effort, c.effortValue, v => W.setField(entryIdx, setIdx, f, v))
    },
    onComplete() {
      const c = this._cur
      if (!c) return
      const set = c.set
      if (!isSideSet(set)) { W.toggle(c.entryIdx, c.setIdx, undefined, { onFocusProgress: this._progress() }); return }
      const sides = set.done ? ['L', 'R'] : ['L', 'R'].filter(s => !set.sides[s].done)
      const progress = this._progress()
      sides.forEach((s, k) => W.toggle(c.entryIdx, c.setIdx, s, { onFocusProgress: k === sides.length - 1 ? progress : undefined }))
    },
    onSkip() { const c = this._cur; if (c && !this.data.fv.skipDis) this._select(c.setIdx + 1) },
    onPrevSet() { const c = this._cur; if (c && !this.data.fv.prevDis) this._select(c.setIdx - 1) },
    onNextSet() { const c = this._cur; if (c && !this.data.fv.nextDis) this._select(c.setIdx + 1) },
    onDot(e) { this._select(Number(e.mark.k)) },

    onExMenu() {
      const c = this._cur
      if (!c) return
      const S = St()
      const entry = c.entry
      const idx = c.entryIdx
      const busy = !!useUI.getState().work
      menuSheet({
        title: exerciseNameFor(exOr(entry.id)),
        items: [
          { icon: 'pencil', label: entry.note ? t('Edit note') : t('Add note'), onClick: () => exerciseNoteSheet(idx) },
          { icon: 'info', label: t('Details'), onClick: () => exerciseDetailSheet(exOr(entry.id)) },
          { icon: 'history', label: t('History'), onClick: () => exerciseHistorySheet(entry.id) },
          !S.active.editingWorkoutId && { icon: 'chartLine', label: t('Progression settings'), onClick: () => W.openProgressionSettings(idx) },
          W.canNoProg(S, idx) && { icon: 'pause', label: t('Don’t count for progression'), sub: t('This exercise, this session only'), on: entry.noProg === true, onClick: () => W.setNoProg(idx, entry.noProg !== true) },
          c.mode === 'reps' && { icon: 'plate', label: t('Plate loading'), onClick: () => barWeightSheet(entry.id, c.cfg) },
          this.properties.pairprev && { icon: 'link', label: t('Make superset with previous'), onClick: () => W.pairAt(idx - 1, idx) },
          this.properties.pairnext && { icon: 'link', label: t('Make superset with next'), onClick: () => W.pairAt(idx, idx + 1) },
          { icon: 'shuffle', label: t('Swap exercise'), onClick: () => W.swapExercise(idx), disabled: busy },
          { icon: 'trash', label: t('Remove exercise'), onClick: () => W.confirmRemoveExercise(idx), danger: true, disabled: busy },
        ],
      })
    },
    onSetMenu() {
      const c = this._cur
      if (!c) return
      const S = St()
      const { set, entry, setIdx, mode } = c
      const restSec = entry.target && entry.target.intensifier && entry.target.intensifier.type === 'restpause' ? entry.target.intensifier.restSec : (S.restPauseSec || 15)
      menuSheet({
        title: t('Set {0}', setIdx + 1),
        items: [
          { icon: 'flame', label: isWarmupRow(set) ? t('Mark as work set') : t('Mark as warm-up'), onClick: () => this._mut(toggleWarmup) },
          { icon: 'arrowDown', label: t('Add drop set'), onClick: () => this._mut(row => addDropTo(row, entry.target)) },
          { icon: 'bolt', label: t('Add burst'), onClick: () => this._mut(row => addBurstTo(row, restSec)) },
          !isWarmupRow(set) && mode !== 'cardio' && { icon: 'gauge', label: t('Taken to failure'), sub: t('Nothing left in the tank'), on: isFailureSet(set), onClick: () => this._mut(toggleFailure) },
          { icon: 'trash', label: t('Delete set'), danger: true, disabled: entry.sets.length <= 1, onClick: () => W.removeSetAt(c.entryIdx, setIdx) },
        ],
      })
    },
  },
}))
