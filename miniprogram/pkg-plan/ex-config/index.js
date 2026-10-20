// Exercise settings (frontend/src/sheets.jsx ExConfig with ProgressionFields, BarWeightEditor and
// DbLoadPicker), opened by utils/sheets.js#exConfigSheet:
//   pageParams(query) → { ex, existing, onSave, onDelete, routine, initial, onReplace, saveLabel }
// The draft `c` lives on the page instance (this.c), outside data: every edit replaces it and
// calls render(), which recomputes the whole view through mapState (model.js viewOf) so store
// changes (unit, default rest, bar weights, load kind) land in the same place.
// Save hands onSave the config (model.js saveOut) and then goes back. Media is not shown (no
// exercise images in the mini program).
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage } from '../../utils/nav.js'
import { menuSheet, durationSheet, customExSheet } from '../../utils/sheets.js'
import { afterSheet } from '../../store/actions.js'
import { useStore } from '../../store/store.js'
import { isCustomEx } from '../../lib/exercises.js'
import { t } from '../../lib/i18n.js'
import { fmtRest } from '../../lib/duration.js'
import {
  REST_MAX, initDraft, viewOf, saveOut, ruleOptions, editMode, editRule, editBodyweight, editPerSide,
  editFailure, editPyramidOn, editPyramidPreset, editPyramidMax, editPyramidRemove, editPyramidAdd,
  editIntensifier, editDbLoad, editField, applyLoadKind, applyBarWeight, applyNoBar,
} from './model.js'

const update = fn => useStore.getState().update(fn)

const page = {
  data: { ready: false },

  mapState(S) {
    if (!this.c || !this.ex) return {}
    const p = this.params || {}
    return viewOf(this.c, this.ex, S, p.routine, {
      existing: p.existing,
      saveLabel: p.saveLabel,
      canReplace: typeof p.onReplace === 'function',
      canDelete: typeof p.onDelete === 'function',
      isCustom: isCustomEx(this.ex),
    })
  },

  onLoad(query) {
    const p = pageParams(query)
    this.params = p
    this.ex = p.ex || null
    if (!this.ex) { wx.navigateBack(); return }
    const S = useStore.getState().S
    this.c = initDraft(this.ex, { existing: p.existing, initial: p.initial, S, routine: p.routine })
    this.render()
    this.setData({ ready: true })
    if (this.data.name) wx.setNavigationBarTitle({ title: this.data.name })
  },

  onUnload() {
    releasePage(this.query)
  },

  render() {
    if (this.__refresh) this.__refresh()
  },
  edit(fn) {
    this.c = fn(this.c)
    this.render()
  },

  /* ---------- fields: one on_<field> handler per stepper (see FIELD_HANDLERS) ---------- */
  num(k, e) {
    const value = e.detail.value
    const S = useStore.getState().S
    this.edit(c => editField(c, k, value, { i: this.pyrI, S }))
  },
  // A pyramid row remembers which set the finger is on, for its steppers' change events.
  onPyrTouch(e) { this.pyrI = Number(e.currentTarget.dataset.i) },
  onMode(e) {
    const p = this.params
    this.edit(c => editMode(c, e.detail.value, this.ex, p.routine))
  },
  onNote(e) {
    // No render: the textarea keeps its own text; only the draft follows it.
    this.c = editField(this.c, 'note', e.detail.value)
  },

  /* ---------- switches ---------- */
  onBodyweight(e) { this.edit(c => editBodyweight(c, e.detail.value)) },
  onPerSide(e) { this.edit(c => editPerSide(c, e.detail.value, this.ex, this.params.routine)) },
  onFailure(e) { this.edit(c => editFailure(c, e.detail.value)) },
  onPyramid(e) { this.edit(c => editPyramidOn(c, e.detail.value)) },
  onBackoff(e) { this.edit(c => ({ ...c, backoff: e.detail.value || undefined })) },

  /* ---------- pyramid ---------- */
  onPreset(e) { this.edit(c => editPyramidPreset(c, Number(e.currentTarget.dataset.k))) },
  onPyrMax(e) { this.edit(c => editPyramidMax(c, Number(e.currentTarget.dataset.i))) },
  onPyrRemove(e) { this.edit(c => editPyramidRemove(c, Number(e.currentTarget.dataset.i))) },
  onPyrAdd() { this.edit(c => editPyramidAdd(c)) },

  /* ---------- rows that open a picker ---------- */
  onRest() {
    const S = useStore.getState().S
    const c = this.c
    durationSheet({
      title: t('Rest for this exercise'),
      value: c.restSec > 0 ? c.restSec : 0,
      max: REST_MAX,
      off: t('Default ({0})', fmtRest(S.restSec)),
      footer: t('Rest after each set of this exercise. 0:00 means your default rest.'),
      onDone: v => this.edit(x => ({ ...x, restSec: v })),
    })
  },
  onRule() {
    const routine = this.params.routine
    const options = ruleOptions(this.c, this.ex, routine)
    if (!options) return
    const cur = this.c.prog || ''
    menuSheet({
      title: t('Progression'),
      items: options.map(o => ({
        label: o.label,
        on: o.value === cur,
        onClick: () => this.edit(c => editRule(c, o.value, this.ex, routine)),
      })),
    })
  },
  onIntensifier() {
    const cur = (this.c.intensifier && this.c.intensifier.type) || ''
    const opts = [
      { value: '', label: t('None') },
      { value: 'dropset', label: t('Drop-set') },
      { value: 'restpause', label: t('Rest-pause') },
    ]
    menuSheet({
      title: t('Intensifier'),
      items: opts.map(o => ({
        label: o.label,
        on: o.value === cur,
        onClick: () => this.edit(c => editIntensifier(c, o.value, useStore.getState().S)),
      })),
    })
  },
  onDbLoad(e) {
    const S = useStore.getState().S
    this.edit(c => editDbLoad(c, e.detail.value, this.ex, S))
  },

  /* ---------- plate loading: per exercise, straight into the store ---------- */
  onKind(e) {
    const k = e.detail.value
    const c = this.c
    update(s => applyLoadKind(s, this.ex, c, k))
  },
  onNoBar(e) {
    const on = e.detail.value
    update(s => applyNoBar(s, this.ex, on))
  },
  onBase(e) {
    const v = e.detail.value
    update(s => applyBarWeight(s, this.ex, v))
  },

  /* ---------- buttons ---------- */
  onSave() {
    if (this.done) return
    const p = this.params
    const out = saveOut(this.c, this.ex, { S: useStore.getState().S, routine: p.routine })
    if (!out) return
    this.done = true
    if (typeof p.onSave === 'function') {
      try { p.onSave(out) } catch (err) { console.error(err) }
    }
    wx.navigateBack()
  },
  leaveThen(fn) {
    if (this.done) return
    this.done = true
    wx.navigateBack()
    afterSheet(() => fn())
  },
  onCustom() {
    const ex = this.ex
    this.leaveThen(() => customExSheet(ex))
  },
  onReplace() {
    const fn = this.params.onReplace
    if (typeof fn === 'function') this.leaveThen(() => fn())
  },
  onDelete() {
    const fn = this.params.onDelete
    if (typeof fn === 'function') this.leaveThen(() => fn())
  },
}

// The steppers: on_<field> → editField(c, field, value). Component tags carry no data-* we rely
// on (the components are virtual hosts), so each field gets its own handler.
const FIELD_HANDLERS = { sets: 'sets', min: 'min', speed: 'speed', sec: 'sec', weight: 'weight', reps: 'reps',
  warmupSets: 'warmupSets', added: 'weight', repsMax: 'repsMax', inc: 'inc', repsMin: 'repsMin', repsTo: 'reps',
  setsMax: 'setsMax', deload: 'deload', dropCount: 'dropCount', dropPct: 'dropPct', rpReps: 'rpReps', rpRest: 'rpRest',
  pyrRep: 'pyrRep', pyrRest: 'pyrRest', pyrW: 'pyrW' }
Object.keys(FIELD_HANDLERS).forEach(name => {
  page['on_' + name] = function (e) { this.num(FIELD_HANDLERS[name], e) }
})

Page(connectPage(page))
