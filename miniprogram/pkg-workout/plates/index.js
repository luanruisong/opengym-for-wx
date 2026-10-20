// BarWeightSheet + BarWeightEditor (frontend/src/sheets.jsx): how an exercise's weight is loaded
// (plates per side, one stack, or no plate line), the bar or base weight, and "No bar".
// params: { exId, cfg } — cfg is the session's config for the exercise (its bodyweight flag turns
// a dumbbell exercise into added weight), so the kind shown is the one the rows derive.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage, back } from '../../utils/nav.js'
import { useStore } from '../../store/store.js'
import { exOr, isBodyweightEq } from '../../lib/exercises.js'
import { t, exerciseNameFor } from '../../lib/i18n.js'
import { fmtNum } from '../../lib/format.js'
import { usesBar, defaultBarWeight, isNoBar, hasBarOverride } from '../../lib/bar.js'
import { loadKindFor, baseWeightFor, withLoadKind } from '../../lib/plates.js'

Page(connectPage({
  data: { name: '', kindOpts: [] },
  mapState(S) {
    const p = pageParams(this.query)
    const ex = exOr(p.exId)
    if (!ex) return {}
    const bar = usesBar(ex)
    const kind = loadKindFor(S, { ...(p.cfg || {}), id: ex.id })
    const noBar = bar && isNoBar(S, ex.id)
    const explicit = hasBarOverride(S, ex.id)
    const def = fmtNum(defaultBarWeight(ex.eq, S.unit)) + ' ' + S.unit
    const extra = t('Applies to this exercise everywhere, not just this plan.')
    return {
      kind,
      kindNote: kind === 'pairs' ? t('Plates split over both sides of a bar.')
        : kind === 'single' ? t('One stack: a belt, a landmine, a plate-loaded machine, a sled.')
          : t('No plate line under the sets.'),
      bar, noBar,
      base: baseWeightFor(S, ex),
      baseLabel: bar ? t('Bar ({0})', S.unit) : t('Base weight ({0})', S.unit),
      foot: (noBar ? t('Plates are counted from 0. Turn this off for the default ({0}).', def)
        : bar ? (explicit ? t('Set to 0 to go back to the default ({0}).', def) : t('Default for this bar type.'))
          : t('The machine or sled itself, before any plate goes on. 0 if it is all plates.')) + ' ' + extra,
    }
  },
  onLoad(query) {
    const p = pageParams(query)
    this.params = p
    const ex = exOr(p.exId)
    if (!ex) { back(); return }
    this.ex = ex
    this.setData({
      name: exerciseNameFor(ex),
      kindOpts: [{ value: 'pairs', label: t('Per side') }, { value: 'single', label: t('Single stack') }, { value: 'none', label: t('Off') }],
    })
  },
  onUnload() { releasePage(this.query) },
  onKind(e) {
    const k = e.detail.value
    const ex = this.ex
    const cfg = this.params.cfg
    const ctx = { ...(cfg || {}), id: ex.id }
    // The kinds a pick would only be restating (see the original's comment): with a cfg, the one
    // the rows derive; without, both bodyweight readings for body-weight equipment.
    const defaults = cfg ? [loadKindFor(null, ctx)]
      : isBodyweightEq(ex.id) ? [true, false].map(b => loadKindFor(null, { id: ex.id, bodyweight: b }))
        : [loadKindFor(null, ctx)]
    useStore.getState().update(s => {
      s.loadKind = withLoadKind(s.loadKind, ex.id, defaults.every(d => d === k) ? null : k)
    })
  },
  onBar(e) {
    const v = e.detail.value
    const id = this.ex.id
    useStore.getState().update(s => {
      s.barWeights = s.barWeights || {}
      const n = Math.max(0, Math.round((v || 0) * 100) / 100)
      if (n > 0) s.barWeights[id] = n; else delete s.barWeights[id]
    })
  },
  onNoBar(e) {
    const on = !!e.detail.value
    const id = this.ex.id
    useStore.getState().update(s => {
      s.barWeights = s.barWeights || {}
      if (on) s.barWeights[id] = 0; else delete s.barWeights[id]
    })
  },
  onDone() { if (!this.closed) { this.closed = true; back() } },
}))
