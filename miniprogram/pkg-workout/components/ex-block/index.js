// <ex-block idx="{{3}}" compact dense pairable />  — one exercise of the running workout
// (frontend/src/views/Workout.jsx ExerciseBlock): name, ⋯ menu, notes, "last time", progression
// line and the set rows. Its own store binding, so typing into one block re-renders that block
// only. The rows' index and side ride on mark: (e.mark.i / .side / .di / .ci / .dir).
//
// properties
//   idx       Number   the entry's index in S.active.entries
//   compact   Boolean  a superset member (smaller title)
//   dense     Boolean  the compact view: only name, menu, plan line and sets
//   pairable  Boolean  a lone exercise: offers "Make superset with previous/next"
import { connectComponent } from '../../../utils/page.js'
import { useStore } from '../../../store/store.js'
import { useUI } from '../../../store/ui.js'
import { exerciseNoteSheet } from '../../../utils/sheets.js'
import { blockModel, viewOf as viewValue } from '../../workout/block-model.js'
import * as W from '../../workout/session.js'

const num = v => (v == null || v === '' ? null : Number(v))
const SWIPE_MIN = 64

Component(connectComponent({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    idx: { type: Number, value: 0 },
    compact: { type: Boolean, value: false },
    dense: { type: Boolean, value: false },
    pairable: { type: Boolean, value: false },
  },
  data: { vm: null, noProgUndo: false },
  observers: {
    'idx, compact, dense, pairable'() { if (this.__refresh) this.__refresh() },
  },
  mapState(S, { ui }) {
    if (!S.active) return { vm: null }
    const p = this.properties
    // A rest ticking once a second changes the UI store, not S: the same block then.
    const key = [p.idx, p.compact, p.dense, p.pairable, !!ui.work, ui.swipeHint && ui.swipeHint.id, ui.setFlash && ui.setFlash.id].join("|")
    if (this._memo && this._memo.S === S && this._memo.key === key) return this._memo.out
    const { vm, ctx } = blockModel(S, p.idx, { compact: p.compact, dense: p.dense, pairable: p.pairable, ui })
    this._ctx = ctx
    const out = { vm, noProgUndo: !!vm && W.canNoProg(S, p.idx) }
    this._memo = { S, key, out }
    return out
  },
  methods: {
    _i(e) { return Number(e.mark && e.mark.i) },
    _side(e) { return (e.mark && e.mark.side) || '' },

    onMore() { W.openMore(this.properties.idx, this._ctx, { pairable: this.properties.pairable }) },
    onNote() { exerciseNoteSheet(this.properties.idx) },
    onNoProgUndo() { W.setNoProg(this.properties.idx, false) },
    onRef() { useStore.getState().update(s => { s.logRef = s.logRef === 'best' ? 'last' : 'best' }) },
    onProg() { W.openProgressionSettings(this.properties.idx) },
    onPairPrev() { const i = this.properties.idx; W.pairAt(i - 1, i) },
    onPairNext() { const i = this.properties.idx; W.pairAt(i, i + 1) },
    onSetMenu(e) { W.openSetMenu(this.properties.idx, this._i(e)) },

    // The three columns: a typed value (change) or a ± step (step), on a row or one side of it.
    _col(n) { const c = this._ctx; return c && (n === 1 ? c.col1 : n === 2 ? c.col2 : c.col3) },
    _typed(n, e) {
      const col = this._col(n)
      if (!col) return
      const idx = this.properties.idx, i = this._i(e), side = this._side(e)
      const raw = num(e.detail.value)
      const v = col.store && raw != null ? col.store(raw) : raw
      if (side) W.setSide(idx, i, side, col.f, v == null ? 0 : v)
      else W.setField(idx, i, col.f, v)
    },
    _stepped(n, e) {
      const col = this._col(n)
      const c = this._ctx
      if (!col || !c) return
      const idx = this.properties.idx, i = this._i(e), side = this._side(e)
      const dir = e.detail.dir
      const row = W.freshSet(idx, i)
      if (!row) return
      if (side) {
        const sd = row.sides && row.sides[side]
        const cur = sd ? sd[col.f] : 0
        if (col.f === 'w') { W.setSide(idx, i, side, 'w', c.stepLoad(cur, col.step, dir)); return }
        const step = col.f === 'r' ? 1 : col.step
        W.setSide(idx, i, side, col.f, Math.max(0, Math.round(((cur || 0) + dir * step) * 100) / 100))
        return
      }
      const cur = row[col.f]
      if (c.mode === 'reps' && col.f === 'w') { W.setField(idx, i, 'w', c.stepLoad(cur, col.step, dir)); return }
      const next = Math.max(0, Math.round(((viewValue(col, cur) || 0) + dir * col.step) * 100) / 100)
      W.setField(idx, i, col.f, col.store ? col.store(next) : next)
    },
    onC1(e) { this._typed(1, e) },
    onC2(e) { this._typed(2, e) },
    onC3(e) { this._typed(3, e) },
    onS1(e) { this._stepped(1, e) },
    onS2(e) { this._stepped(2, e) },
    onS3(e) { this._stepped(3, e) },

    onEff(e) {
      const c = this._ctx
      if (!c || !c.col3 || !c.col3.eff) return
      W.openEffort(this.properties.idx, this._i(e), c.col3.eff, this._side(e) || undefined)
    },
    onEffStep(e) {
      const c = this._ctx
      if (!c || !c.col3 || !c.col3.eff) return
      W.stepEffortAt(this.properties.idx, this._i(e), c.col3.eff, Number(e.mark.dir), this._side(e) || undefined)
    },
    onCheck(e) { W.toggle(this.properties.idx, this._i(e), this._side(e) || undefined) },
    onGo(e) {
      const row = W.freshSet(this.properties.idx, this._i(e))
      if (!row || row.done || useUI.getState().work) return
      W.startTimed(this.properties.idx, this._i(e))
    },

    // Drop-set and rest-pause sub-rows.
    onDropW(e) { W.setDropField(this.properties.idx, this._i(e), Number(e.mark.di), 'w', num(e.detail.value) || 0, this._side(e) || undefined) },
    onDropWStep(e) {
      const c = this._ctx
      if (!c) return
      const v = e.detail.value
      W.setDropField(this.properties.idx, this._i(e), Number(e.mark.di), 'w', c.stepLoad(v, c.loadStep, e.detail.dir), this._side(e) || undefined)
    },
    onDropR(e) { W.setDropField(this.properties.idx, this._i(e), Number(e.mark.di), 'r', num(e.detail.value) || 0, this._side(e) || undefined) },
    onRemoveDrop(e) { W.removeDrop(this.properties.idx, this._i(e), Number(e.mark.di)) },
    onBurstR(e) { W.setClusterField(this.properties.idx, this._i(e), Number(e.mark.ci), num(e.detail.value) || 0, this._side(e) || undefined) },
    onRemoveBurst(e) { W.removeCluster(this.properties.idx, this._i(e), Number(e.mark.ci)) },
    onAddDrop(e) { W.addDropRow(this.properties.idx, this._i(e)) },
    onAddBurst(e) { W.addBurstRow(this.properties.idx, this._i(e)) },

    onAddWarmup() { W.addWarmup(this.properties.idx) },
    onAddSet() { W.addSet(this.properties.idx) },
    onRemoveSet() { if (!(this.data.vm && this.data.vm.removeSetDis)) W.removeSet(this.properties.idx) },
    onHintClose() { W.dismissHint() },

    // Swipe on a set row (Settings → Swipe actions): toward the start removes (with Undo),
    // toward the end copies. Judged on release; a mostly vertical move is a scroll.
    onSwStart(e) {
      const tch = e.touches && e.touches[0]
      this._sw = tch ? { x: tch.clientX, y: tch.clientY, i: this._i(e) } : null
      W.dismissHint()
    },
    onSwCancel() { this._sw = null },
    onSwEnd(e) {
      const st = this._sw
      this._sw = null
      if (!st || !(this.data.vm && this.data.vm.swipe)) return
      const tch = e.changedTouches && e.changedTouches[0]
      if (!tch) return
      const dx = tch.clientX - st.x, dy = tch.clientY - st.y
      if (Math.abs(dx) < SWIPE_MIN || Math.abs(dy) > Math.abs(dx) * 0.6) return
      W.swipeGuard.at = Date.now()
      if (dx < 0) W.removeSetAt(this.properties.idx, st.i)
      else W.copyActiveSet(this.properties.idx, st.i)
    },
  },
}))

