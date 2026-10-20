// "Add to my plan" (frontend/src/sheets.jsx AddToRoutine), opened by
// utils/sheets.js#addToRoutineSheet(ex): pick a routine (or a new one), then the exercise's
// config page (exConfigSheet) for sets, reps and weight. The routine is only touched when that
// config is saved; a new routine is created then too, and opened.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage } from '../../utils/nav.js'
import { useStore } from '../../store/store.js'
import { useUI } from '../../store/ui.js'
import { navAfterSheet } from '../../store/actions.js'
import { exConfigSheet } from '../../utils/sheets.js'
import { exOr, EXIDX } from '../../lib/exercises.js'
import { exCount, exerciseNameText, uid } from '../../lib/format.js'
import { t, exerciseNameFor, exerciseNameClass } from '../../lib/i18n.js'
import { glyphOf, DEFAULT_GLYPH } from '../../lib/glyphs.js'

const getS = () => useStore.getState().S
const toast = m => useUI.getState().toast(m)

Page(connectPage({
  data: { resting: false, title: '', cap: false, routines: [] },

  mapState(S, { ui }) {
    const out = { resting: !!(ui.timer || ui.work) }
    const ex = this.ex
    if (!ex) return out
    out.title = t('Add “{0}”', exerciseNameFor(ex))
    out.cap = exerciseNameClass(ex) === 'capitalize'
    out.routines = (S.routines || []).map(r => ({
      id: r.id,
      icon: glyphOf(r.emoji),
      name: r.name,
      count: exCount((r.ex || []).length),
      has: (r.ex || []).some(e => e.id === ex.id),
    }))
    return out
  },

  onLoad(query) {
    const p = pageParams(query)
    const ex = p.ex ? (EXIDX[p.ex.id] || p.ex) : null
    if (!ex) { wx.navigateBack(); return }
    this.ex = ex
    this.__refresh()
  },
  onUnload() { releasePage(this.query) },

  onPick(e) { this.pick(e.currentTarget.dataset.id) },
  onNew() { this.pick('_new') },

  pick(rid) {
    if (this.done) return
    this.done = true
    const ex = this.ex
    const isNew = rid === '_new'
    const routine = isNew ? null : getS().routines.find(x => x.id === rid) || null
    const onSave = cfg => {
      let newId = null
      useStore.getState().update(s => {
        let r
        if (isNew) {
          newId = uid()
          r = { id: newId, name: t('New routine'), emoji: DEFAULT_GLYPH, ex: [] }
          s.routines.push(r)
        } else r = s.routines.find(x => x.id === rid)
        if (r) r.ex.push(Object.assign({ id: ex.id }, cfg))
      })
      const live = getS().routines.find(x => x.id === (isNew ? newId : rid))
      toast(t('“{0}” added to {1}', exerciseNameText(ex), live ? live.name : t('routine')))
      if (isNew && live) navAfterSheet('/plan/r/' + live.id)
    }
    // The original closed this sheet, then opened the config: back first, then open it from
    // the page below once this one is off the top.
    wx.navigateBack({
      complete: () => setTimeout(() => exConfigSheet(exOr(ex.id) || ex, null, onSave, null, routine), 0),
    })
  },
}))
