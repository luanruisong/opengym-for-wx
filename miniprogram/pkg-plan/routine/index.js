// The routine editor (frontend/src/views/RoutineEdit.jsx). Opened by navTo('/plan/r/' + id) →
// /pkg-plan/routine/index?id=. Every change persists at once; there is no Save.
//
// Mini program differences: no drag-to-reorder (the Move up / Move down arrows move one
// exercise; ops.js keeps reorderRoutineUnit for parity), no swipe-to-remove (a long press on a
// row offers Remove; the exercise sheet keeps its Remove too), no thumbnails, and printing
// copies the routine as text to the clipboard.
import { connectPage } from '../../utils/page.js'
import { navTo } from '../../utils/nav.js'
import { useStore } from '../../store/store.js'
import { useUI } from '../../store/ui.js'
import { afterSheet, planText } from '../../store/actions.js'
import { glyphPicker, exercisePicker, exConfigSheet, confirmSheet, supersetSheet, menuSheet } from '../../utils/sheets.js'
import { exOr } from '../../lib/exercises.js'
import { activeProfile, exAvailable } from '../../lib/equipment.js'
import { exerciseNameText } from '../../lib/format.js'
import { t, exerciseNameFor, exerciseNameClass } from '../../lib/i18n.js'
import { supersetUnits, moveRoutineEntry, cleanupSg, exLine, defaultConfig } from '../../lib/history.js'
import { supersetMeta, setSupersetMeta } from '../../lib/superset-meta.js'
import { fmtRest } from '../../lib/duration.js'
import { glyphOf } from '../../lib/glyphs.js'
import { copyRoutine, deleteRoutine, replaceSlotExercise } from '../../lib/routines.js'
import { speedUnitOf } from '../../lib/speed.js'
import { POLICIES_FOR, POLICY_NAME, POLICY_DESC } from '../../lib/progression.js'
import { loadOfRoutine, rankOf, MUSCLE_NAME } from '../../lib/muscles.js'
import { moveEntry, toggleLink, removeRoutineExercise } from './ops.js'

const st = () => useStore.getState()
const toast = (m, o) => useUI.getState().toast(m, o)

Page(connectPage({
  data: { nameInit: '' },

  mapState(S) {
    const id = this.routineId
    if (!id) return {}
    const r = (S.routines || []).find(x => x.id === id)
    if (!r) {
      if (!this.__gone) { this.__gone = true; navTo('/plan') }
      return { ready: false }
    }
    const ex = r.ex || []
    const units = supersetUnits(ex)
    const groups = units.filter(u => u.length > 1)
    const unitFirst = new Set(groups.map(u => u[0]))
    const ssPos = new Map()
    groups.forEach((u, k) => u.forEach((idx, n) => ssPos.set(idx, String.fromCharCode(65 + (k % 26)) + (n + 1))))
    const unitOf = new Map(units.flatMap(u => u.map(idx => [idx, u])))
    const inSS = new Set(groups.flat())
    const profile = activeProfile(S)
    const missingCount = profile ? ex.filter(e => !exAvailable(S, exOr(e.id))).length : 0
    const speedUnit = speedUnitOf(S)
    const rows = ex.map((e, i) => {
      const x = exOr(e.id)
      const meta = unitFirst.has(i) ? supersetMeta(ex, unitOf.get(i)) : null
      return {
        i,
        ssHead: !!meta,
        ssName: meta ? (meta.name || t('Superset')) : '',
        ssRest: meta && meta.rest > 0 ? '· ' + t('{0} rest after each round', fmtRest(meta.rest)) : '',
        ssPos: ssPos.get(i) || '',
        inSS: inSS.has(i),
        name: exerciseNameFor(x),
        nameCls: exerciseNameClass(x) || '',
        line: exLine(e, S.unit, speedUnit),
        note: e.note || '',
        noEquip: !!(profile && !exAvailable(S, x)),
        showLink: i > 0,
        linked: !!(i > 0 && e.sg && ex[i - 1].sg === e.sg),
        upDis: !moveRoutineEntry(ex, i, -1),
        downDis: !moveRoutineEntry(ex, i, 1),
      }
    })
    const prog = r.prog || 'linear'
    const deload = r.excludeFromProgression === true
    let load = {}, mchips = []
    if (ex.length) {
      load = loadOfRoutine(r)
      mchips = rankOf(load).worked.slice(0, 6).map(m => ({ m, label: t(MUSCLE_NAME[m]) }))
    }
    return {
      ready: true,
      glyph: glyphOf(r.emoji),
      progName: t(POLICY_NAME[prog] || POLICY_NAME.linear),
      deload,
      progNote: deload
        ? t('A deload routine opens at the numbers set here, so the progression above does not apply to it.') + ' ' + t('The next regular target continues from the last included workout.')
        : t(POLICY_DESC[prog] || POLICY_DESC.linear) + ' ' + t('Applies to every exercise in this routine that does not set its own rule.'),
      missText: missingCount > 0 ? t('{0} of {1} exercises need equipment outside "{2}"', missingCount, ex.length, profile.name) : '',
      rows,
      hasEx: ex.length > 0,
      load,
      body: S.body || 'male',
      mchips,
    }
  },

  onLoad(query) {
    this.routineId = query.id ? decodeURIComponent(query.id) : ''
    const r = this.routine()
    if (!r) {
      if (!this.__gone) { this.__gone = true; navTo('/plan') }
      return
    }
    this.setData({ nameInit: r.name || '' })
    if (r.name) wx.setNavigationBarTitle({ title: r.name })
    this.__refresh()
  },

  /* ---------- helpers ---------- */
  routine() {
    return (st().S.routines || []).find(x => x.id === this.routineId) || null
  },
  edit(fn) {
    const id = this.routineId
    st().update(s => {
      const r = s.routines.find(x => x.id === id)
      if (r) fn(r.ex)
    })
  },
  editRoutine(fn) {
    const id = this.routineId
    st().update(s => {
      const r = s.routines.find(x => x.id === id)
      if (r) fn(r)
    })
  },
  idx(e) { return Number(e.currentTarget.dataset.i) },

  /* ---------- header ---------- */
  onName(e) {
    const v = String(e.detail.value || '').trim() || t('Routine')
    this.editRoutine(r => { r.name = v })
    wx.setNavigationBarTitle({ title: v })
  },
  onGlyph() {
    const r = this.routine()
    if (!r) return
    glyphPicker(r.emoji, g => this.editRoutine(x => { x.emoji = g }))
  },
  onProg() {
    const r = this.routine()
    if (!r) return
    const cur = r.prog || 'linear'
    menuSheet({
      title: t('Progression'),
      items: POLICIES_FOR.reps.map(p => ({
        label: t(POLICY_NAME[p]), sub: t(POLICY_DESC[p]), on: p === cur,
        onClick: () => this.editRoutine(x => { x.prog = p }),
      })),
    })
  },
  onDeload(e) {
    const v = !!e.detail.value
    this.editRoutine(r => {
      if (v) r.excludeFromProgression = true
      else delete r.excludeFromProgression
    })
  },

  /* ---------- list ---------- */
  onRow(e) {
    const i = this.idx(e)
    const r = this.routine()
    const entry = r && r.ex[i]
    if (!entry) return
    const ex = exOr(entry.id)
    const removeHere = () => removeRoutineExercise(this.routineId, i)
    exConfigSheet(ex, entry, cfg => this.edit(x => {
      if (!x[i]) return
      x[i] = { id: x[i].id, sg: x[i].sg, ...(x[i].sg ? { sgName: x[i].sgName, sgRest: x[i].sgRest } : {}), ...cfg }
      cleanupSg(x)
    }), removeHere, r, null, () => this.replace(i))
  },
  onRowLong(e) {
    const i = this.idx(e)
    wx.showActionSheet({
      itemList: [t('Remove')],
      itemColor: '#ff453a',
      success: res => { if (res.tapIndex === 0) removeRoutineExercise(this.routineId, i) },
      fail: () => {},
    })
  },
  onLink(e) {
    const i = this.idx(e)
    this.edit(ex => toggleLink(ex, i))
  },
  onUp(e) { this.move(this.idx(e), -1) },
  onDown(e) { this.move(this.idx(e), 1) },
  move(i, dir) {
    const r = this.routine()
    // Guard before update so a boundary press cannot trigger persistence or cleanup.
    if (!r || !moveRoutineEntry(r.ex, i, dir)) return
    this.edit(ex => { moveEntry(ex, i, dir) })
  },
  onSuperset(e) {
    const i = this.idx(e)
    const r = this.routine()
    const sg = r && r.ex[i] && r.ex[i].sg
    if (!sg) return
    const unit = supersetUnits(r.ex).find(u => u.includes(i)) || [i]
    supersetSheet(supersetMeta(r.ex, unit), meta => this.edit(ex => { setSupersetMeta(ex, sg, meta) }))
  },

  // Replace (#110): the picked exercise goes into slot `i`, which keeps its sets, reps, weight and
  // the rest. A slot that is no longer the exercise it was opened on is left alone.
  replace(i) {
    const id = this.routineId
    const r = this.routine()
    const openedOn = r && r.ex[i] && r.ex[i].id
    if (!openedOn) return
    const commit = (ex, fn) => {
      let done = false
      this.edit(x => { if (x[i] && x[i].id === openedOn) { x[i] = fn(x[i]); done = true } })
      if (done) toast(t('Replaced with “{0}”', exerciseNameText(ex)))
    }
    exercisePicker((ex, quick) => {
      const live = st().S
      const lr = live.routines.find(x => x.id === id)
      const slot = lr && lr.ex[i]
      if (!slot || slot.id !== openedOn) return
      if (quick && ex.id === openedOn) return
      if (quick) { commit(ex, current => replaceSlotExercise(current, ex.id, live, id)); return }
      const next = replaceSlotExercise(slot, ex.id, live, id)
      afterSheet(() => exConfigSheet(ex, next, cfg => commit(ex, current => ({ id: ex.id, sg: current.sg, ...cfg })), null, lr, null, null, t('Replace')))
    }, { title: t('Replace exercise'), like: openedOn })
  },

  onAdd() {
    exercisePicker((ex, quick) => {
      const r = this.routine()
      if (!r) return
      if (quick) {
        this.edit(x => { x.push({ id: ex.id, ...defaultConfig(ex.id) }) })
        toast(t('“{0}” added to {1}', exerciseNameText(ex), r.name))
      } else {
        afterSheet(() => exConfigSheet(ex, null, cfg => this.edit(x => { x.push({ id: ex.id, ...cfg }) }), null, r))
      }
    })
  },

  /* ---------- footer ---------- */
  onCopy() {
    const r = this.routine()
    if (!r) return
    const copy = copyRoutine(r, t('Copy'))
    st().update(s => { s.routines.push(copy) })
    navTo('/plan/r/' + copy.id, { replace: true })
  },
  onPrint() {
    const r = this.routine()
    if (!r || !r.ex.length) return
    wx.setClipboardData({
      data: planText(st().S, { routineId: this.routineId }),
      success: () => toast(t('Copied')),
      fail: () => {},
    })
  },
  onDelete() {
    const r = this.routine()
    if (!r) return
    const id = this.routineId
    confirmSheet({
      title: t('Delete routine?'), message: t('“{0}” and its exercises will be removed.', r.name),
      confirmText: t('Delete'), danger: true,
      onConfirm: () => {
        this.__gone = true
        st().update(s => { deleteRoutine(s, id) })
        navTo('/plan')
      },
    })
  },
}))
