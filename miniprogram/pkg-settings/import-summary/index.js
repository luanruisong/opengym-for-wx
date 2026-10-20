// Import from another app: what a parsed CSV/XML export would do, before anything is written
// (frontend/src/sheets.jsx ImportSummary). Opened by pkg-settings/lib/imports.js importFromApp with { parsed }.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage } from '../../utils/nav.js'
import { applyImport, effortLine } from '../lib/imports.js'
import { t, tn } from '../../lib/i18n.js'
import { fmtDateRange } from '../../lib/format.js'
import { effortOf } from '../../lib/history.js'

Page(connectPage({
  data: { ok: false },

  mapState(S) {
    const parsed = this.parsed
    if (!parsed) return { ok: false }
    const isBW = parsed.kind === 'bodyweight'
    const bw = S.bodyweight || [], ws = S.workouts || []
    const have = isBW
      ? parsed.bodyweight.filter(b => bw.some(x => x.d === b.d)).length
      : parsed.workouts.filter(w => ws.some(x => x.d === w.d)).length
    const fresh = (isBW ? parsed.bodyweight.length : parsed.workouts.length) - have
    const tiles = isBW
      ? [{ k: 'n', l: t('Weigh-ins'), v: String(parsed.bodyweight.length) }, { k: 'f', l: t('New'), v: String(fresh) }]
      : [
        { k: 'w', l: t('Workouts'), v: String(parsed.workouts.length) },
        { k: 's', l: t('Sets'), v: String(parsed.sets || 0) },
        { k: 'm', l: t('Exercises matched'), v: String(parsed.matched || 0) },
        { k: 'c', l: t('Added as your own'), v: String(parsed.created || 0) },
      ]
    const notes = []
    let warn = ''
    if (parsed.mixedUnits) warn = t('The file mixes kg and lb, so each set is converted to {0}.', S.unit)
    else if (parsed.converted) warn = t('The file is in {0} and your profile is in {1}, so weights get converted.', parsed.fileUnit, S.unit)
    if (!isBW && !parsed.fileUnit && !parsed.mixedUnits) notes.push(t('The file doesn’t say which unit it uses, so numbers are imported as they are.'))
    if (have > 0) notes.push(t('{0} days already have data here and will be left alone.', have))
    if (!isBW && ((parsed.rirSets || 0) + (parsed.rpeSets || 0)) > 0) {
      notes.push(effortLine(effortOf(S), parsed.rirSets || parsed.rpeSets, parsed.rirSets ? 'RIR' : 'RPE'))
    }
    if (!isBW && parsed.skipped > 0) {
      notes.push(tn('{0} row skipped (couldn’t read it)', '{0} rows skipped (couldn’t read them)', parsed.skipped))
    }
    const un = (!isBW && parsed.unmatchedNames) || []
    return {
      ok: true,
      range: fmtDateRange(parsed.from, parsed.to, true),
      tiles,
      warn,
      notes: notes.map((text, k) => ({ k, text })),
      unmatchedTitle: un.length ? t('Not in the library, so they’re added as your own exercises') : '',
      unmatched: un.slice(0, 12).map((n, k) => ({ k, n })),
      more: un.length > 12 ? '+' + (un.length - 12) : '',
      fresh: fresh > 0,
      importLabel: fresh > 0 ? t('Import') : t('Nothing new to import'),
      cancelLabel: t('Cancel'),
    }
  },

  onLoad(query) {
    // mapState already ran once (with no parsed) when the binding was made; fill in now.
    this.parsed = pageParams(query).parsed || null
    if (!this.parsed) { wx.navigateBack({ fail() { wx.switchTab({ url: '/pages/home/index' }) } }); return }
    wx.setNavigationBarTitle({ title: this.parsed.source ? t('Import from {0}', this.parsed.source) : t('Import history') })
    this.__refresh()
  },

  onUnload() { releasePage(this.query) },

  onImport() {
    if (!this.parsed || !this.data.fresh || this.done) return
    this.done = true
    applyImport(this.parsed)
    wx.navigateBack()
  },

  onCancel() { wx.navigateBack() },
}))
