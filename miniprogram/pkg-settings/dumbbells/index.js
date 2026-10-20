// Settings → Equipment → Dumbbells (sheets.jsx DumbbellInventorySheet, issue #376): the single
// bells owned, per unit (lib/dumbbells.js). Tapping a weight takes it off, the field adds one,
// the quick fill writes the usual rack for the unit. Every change is stamped.
import { connectPage } from '../../utils/page.js'
import { useStore } from '../../store/store.js'
import { useUI } from '../../store/ui.js'
import { t } from '../../lib/i18n.js'
import { fmtPlate } from '../../lib/format.js'
import { dumbbellsOf, withDumbbells, presetWeights, cleanWeights } from '../../lib/dumbbells.js'

const save = ws => useStore.getState().update(s => { s.dumbbells = withDumbbells(s, ws) })

Page(connectPage({
  data: { draft: null, list: [], hasList: false },

  mapState(S) {
    const unit = S.unit === 'lb' ? 'lb' : 'kg'
    const list = dumbbellsOf(S)
    const preset = presetWeights(unit)
    return {
      intro: t('The weights you own, one bell each. Progression, deloads, warm-ups and the + and − buttons of dumbbell lifts land only on these.'),
      list: list.map(w => ({ w, label: fmtPlate(w) })),
      hasList: list.length > 0,
      emptyL: t('No list yet, so dumbbell lifts step by their increment as usual.'),
      ph: t('Weight ({0})', unit),
      addL: t('Add'),
      fillL: t('Fill in {0} to {1} {2}, every {3}', fmtPlate(preset[0]), fmtPlate(preset[preset.length - 1]), unit, fmtPlate(preset[1] - preset[0])),
      clearL: t('Clear the list'),
      doneL: t('Done'),
    }
  },

  onDraft(e) { this.setData({ draft: e.detail.value }) },

  onAdd() {
    const w = cleanWeights([this.data.draft])[0]
    if (!w) { useUI.getState().toast(t('Enter a valid weight')); return }
    save([...dumbbellsOf(useStore.getState().S), w])
    this.setData({ draft: null })
  },

  onRemove(e) {
    const w = Number(e.currentTarget.dataset.w)
    save(dumbbellsOf(useStore.getState().S).filter(x => x !== w))
  },

  onFill() {
    const S = useStore.getState().S
    save(presetWeights(S.unit === 'lb' ? 'lb' : 'kg'))
  },

  onClear() { save([]) },

  onDone() { wx.navigateBack() },
}))
