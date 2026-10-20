// Import from Hevy through its API (frontend/src/sheets.jsx HevyImportSheet). The key lives in this
// page only — wiped after the fetch and when the page goes, never stored. The fetched payload is
// kept on the page instance (this.payload), not in data: only counts and strings are rendered.
import { connectPage } from '../../utils/page.js'
import { releasePage } from '../../utils/nav.js'
import { fetchHevy, applyHevyImport, effortLine } from '../lib/imports.js'
import { useUI } from '../../store/ui.js'
import { t, tn } from '../../lib/i18n.js'
import { fmtDate } from '../../lib/format.js'
import { effortOf } from '../../lib/history.js'
import { copyText } from '../lib/clipboard.js'
import { HEVY_DEV_SETTINGS, HEVY_API } from '../lib/import-hevy.js'

function hevyProgressLabel(p) {
  if (!p) return t('Fetching from Hevy…')
  if (p.stage === 'templates') return t('Fetching exercises… ({0}/{1})', p.page, p.pageCount)
  if (p.stage === 'workouts') return t('Fetching workouts… ({0}/{1})', p.page, p.pageCount)
  if (p.stage === 'routines') return t('Fetching routines… ({0}/{1})', p.page, p.pageCount)
  if (p.stage === 'body') return t('Fetching weigh-ins… ({0}/{1})', p.page, p.pageCount)
  if (p.stage === 'parse') return t('Matching exercises…')
  return t('Fetching from Hevy…')
}

const span = (from, to) => (from ? (from === to ? fmtDate(from, true) : fmtDate(from, true) + ' – ' + fmtDate(to, true)) : '')

Page(connectPage({
  data: {
    apiKey: '', busy: false, progressText: '', hasPayload: false,
    wantWorkouts: true, wantRoutines: true, wantBody: true,
    domainNote: '小程序需要在微信公众平台「开发管理 → 开发设置 → 服务器域名」把 ' + HEVY_API + ' 加入 request 合法域名，否则无法连接。',
  },

  mapState(S) {
    const base = {
      L: {
        intro: t('Pull your history with a Hevy Pro API key. The key is only used for this import and is not saved.'),
        keyLabel: t('Hevy API key'),
        getKey: t('Get your API key'),
        where: ' · ' + t('Hevy → Settings → Developer'),
        fetch: t('Fetch from Hevy'),
        fetching: t('Fetching from Hevy…'),
        cancel: t('Cancel'),
        workouts: t('Import workouts'),
        routines: t('Import routines'),
        body: t('Import weigh-ins'),
      },
    }
    const payload = this.payload
    if (!payload) return Object.assign(base, { sum: null })
    const { wantWorkouts, wantRoutines, wantBody } = this.data
    const w = payload.workouts, r = payload.routines, b = payload.bodyweight
    const ws = S.workouts || [], bw = S.bodyweight || []
    const haveW = w.workouts.filter(x => ws.some(y => y.d === x.d)).length
    const freshW = w.workouts.length - haveW
    const haveB = b.bodyweight.filter(x => bw.some(y => y.d === x.d)).length
    const freshB = b.bodyweight.length - haveB
    const freshR = r.routines.length
    const canImport = (wantWorkouts && freshW > 0) || (wantRoutines && freshR > 0) || (wantBody && freshB > 0)
    const unmatched = [...new Set([
      ...(wantWorkouts ? w.unmatchedNames || [] : []),
      ...(wantRoutines ? r.unmatchedNames || [] : []),
    ])].sort()
    const notes = []
    if (w.converted || r.converted) notes.push({ k: 'u', text: t('Hevy stores weights in kg, so they’ll be converted to {0}.', S.unit), warn: true })
    if (wantWorkouts && ((w.rirSets || 0) + (w.rpeSets || 0)) > 0) {
      notes.push({ k: 'e', text: effortLine(effortOf(S), w.rirSets || w.rpeSets, w.rirSets ? 'RIR' : 'RPE'), warn: false })
    }
    return Object.assign(base, {
      sum: {
        range: span(w.from, w.to) || span(b.from, b.to),
        tiles: [
          { k: 'w', l: t('Workouts'), v: String(w.workouts.length) },
          { k: 'r', l: t('Routines'), v: String(r.routines.length) },
          { k: 'm', l: t('Exercises matched'), v: String((w.matched || 0) + (r.matched || 0)) },
          { k: 'c', l: t('Added as your own'), v: String((w.created || 0) + (r.created || 0)) },
        ],
        showW: w.workouts.length > 0,
        subW: t('{0} new · {1} days already here', freshW, haveW),
        showR: r.routines.length > 0,
        subR: t('{0} routines · {1} exercises, added as new plans', freshR, r.exerciseCount || 0),
        showB: b.bodyweight.length > 0,
        subB: t('{0} new · {1} days already here', freshB, haveB),
        notes,
        unmatchedTitle: unmatched.length ? t('Not in the library, so they’re added as your own exercises') : '',
        unmatched: unmatched.slice(0, 12).map((n, k) => ({ k, n })),
        more: unmatched.length > 12 ? '+' + (unmatched.length - 12) : '',
        canImport,
        importLabel: canImport ? t('Import') : t('Nothing new to import'),
      },
    })
  },

  onUnload() {
    this.gone = true
    this.payload = null
    releasePage(this.query)
  },

  onKey(e) { this.setData({ apiKey: e.detail.value }) },

  async onFetch() {
    const key = (this.data.apiKey || '').trim()
    if (this.data.busy) return
    if (!key) { useUI.getState().toast(t('Paste your Hevy API key first')); return }
    this.setData({ busy: true, progressText: hevyProgressLabel({ stage: 'templates', page: 1, pageCount: 1 }), hasPayload: false })
    this.payload = null
    let data = null
    try {
      data = await fetchHevy(key, p => { if (!this.gone) this.setData({ progressText: hevyProgressLabel(p) }) })
    } catch (e) { data = null }
    if (this.gone) return
    // The key is wiped after a successful fetch (as the original did); a failed one keeps it to retry.
    const patch = { busy: false, progressText: '' }
    if (data) {
      this.payload = data
      Object.assign(patch, {
        apiKey: '',
        hasPayload: true,
        wantWorkouts: !!data.workouts.workouts.length,
        wantRoutines: !!data.routines.routines.length,
        wantBody: !!data.bodyweight.bodyweight.length,
      })
    }
    this.setData(patch)
    this.__refresh()
  },

  // One handler per switch: a dataset on a virtual-host component is not reliable.
  setWant(k, v) { this.setData({ [k]: !!v }); this.__refresh() },
  onWantW(e) { this.setWant('wantWorkouts', e.detail.value) },
  onWantR(e) { this.setWant('wantRoutines', e.detail.value) },
  onWantB(e) { this.setWant('wantBody', e.detail.value) },

  onImport() {
    if (!this.payload || this.done) return
    const s = this.data.sum
    if (!s || !s.canImport) return
    this.done = true
    const { wantWorkouts, wantRoutines, wantBody } = this.data
    applyHevyImport(this.payload, { wantWorkouts, wantRoutines, wantBody })
    this.payload = null
    wx.navigateBack()
  },

  async onCopyLink() {
    if (await copyText(HEVY_DEV_SETTINGS)) useUI.getState().toast(t('Copied'))
  },

  onCancel() {
    if (this.data.busy) return
    wx.navigateBack()
  },
}))
