// An exercise's detail (frontend/src/sheets.jsx ExerciseDetail + OneRM + BarWeightEditor +
// DbLoadPicker), opened by utils/sheets.js#exerciseDetailSheet(ex).
//
// params: { ex }  — the exercise object; the page reads the live one by id (EXIDX), so an edit of
// a custom exercise shows here at once.
//
// The steps and the description come in their own data subpackages the first time any detail is
// shown (lib/i18n details loader): instrFor/descFor answer empty until then and onLangChange
// fires when they land, which re-runs mapState.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage } from '../../utils/nav.js'
import { useStore } from '../../store/store.js'
import { useUI } from '../../store/ui.js'
import { detailTags, deleteCustomEx } from '../../store/actions.js'
import { addToRoutineSheet, exerciseHistorySheet, customExSheet } from '../../utils/sheets.js'
import { EXIDX, exOr, isCardio, isAssisted, isBodyweightEq, isCustomEx } from '../../lib/exercises.js'
import { fmtNum, fmtDate } from '../../lib/format.js'
import { lastEntryFor, bestWeightFor, setLabel, modeOf } from '../../lib/history.js'
import { usesBar, defaultBarWeight, hasBarOverride, isNoBar } from '../../lib/bar.js'
import { withLoadKind, loadKindFor, baseWeightFor } from '../../lib/plates.js'
import { estimate1RM, best1RM, REP_CAP, formulaOf, FORMULA_NAMES } from '../../lib/onerm.js'
import { isBellEx, dbLoadFor, withDbLoad, isOneArm, currentDbLoad } from '../../lib/dumbbells.js'
import { speedUnitOf } from '../../lib/speed.js'
import { t, getLang, instrFor, instrTranslated, descFor, exerciseNameFor, exerciseNameClass, onLangChange } from '../../lib/i18n.js'
import { isFav, toggleFav } from '../../lib/favourites.js'
import { mediaOf, cleanUrl } from '../../lib/media-refs.js'
import { mediaStore } from '../../lib/media-store.js'
import { backThen } from '../sheet-finish.js'

const getS = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const toast = m => useUI.getState().toast(m)

const KIND_OPTS = () => [{ value: 'pairs', label: t('Per side') }, { value: 'single', label: t('Single stack') }, { value: 'none', label: t('Off') }]
const DB_OPTS = () => [{ value: 'as', label: t('As entered') }, { value: 'each', label: t('Each') }, { value: 'total', label: t('Both') }]

Page(connectPage({
  data: {
    resting: false,
    ok: false,
    name: '',
    cap: false,
    fav: false,
    tags: [],
    desc: '',
    media: null,           // { kind, src, poster } of a custom exercise's own file
    link: '',
    bestLine: false,
    bestVal: '',
    lastLine: '',
    hasLast: false,
    custom: false,
    // plate loading
    plates: false,
    kindOpts: [],
    kind: 'none',
    kindNote: '',
    isBar: false,
    noBar: false,
    baseLabel: '',
    base: 0,
    baseNote: '',
    // weight meaning (dumbbells / kettlebells)
    bell: false,
    dbOpts: [],
    dbLoad: 'as',
    dbNote: '',
    // estimated 1RM
    orm: false,
    ormFrom: '',
    ormFromDim: '',
    w: 20,
    r: 5,
    wLabel: '',
    est: '',
    estNote: '',
    // steps
    steps: [],
    stepsNote: '',
  },

  mapState(S, { ui }) {
    const out = { resting: !!(ui.timer || ui.work) }
    if (!this.exId) return out
    const ex = EXIDX[this.exId] || this.exParam || exOr(this.exId)
    this.ex = ex
    const unit = S.unit
    const last = lastEntryFor(S, ex.id)
    const best = bestWeightFor(S, ex.id, currentDbLoad(S, ex.id))
    const m = isCustomEx(ex) ? mediaOf(ex) : null
    Object.assign(out, {
      ok: true,
      name: exerciseNameFor(ex),
      cap: exerciseNameClass(ex) === 'capitalize',
      fav: isFav(S, ex.id),
      tags: detailTags(ex).map(tg => ({ key: tg.key, label: tg.label, acc: !!tg.acc, icon: tg.icon || '' })),
      desc: descFor(ex) || '',
      media: m ? this.mediaView(m) : null,
      link: isCustomEx(ex) && typeof ex.url === 'string' ? (cleanUrl(ex.url) || '') : '',
      bestLine: best > 0,
      bestVal: best > 0 ? fmtNum(best) + ' ' + unit : '',
      lastLine: best > 0 && last ? ' · ' + t('last') + ' ' + fmtDate(last.d) + ': ' + last.sets.map(s => setLabel(ex.id, s, last.target, speedUnitOf(S))).join(', ') : '',
      hasLast: !!last,
      custom: isCustomEx(ex),
      steps: instrFor(ex).map((s, i) => ({ i, n: (i + 1) + '.', s: String(s) })),
      stepsNote: getLang() !== 'en' && !instrTranslated(ex) ? ' · ' + t('instructions in English') : '',
    })
    Object.assign(out, this.platesView(S, ex), this.dbView(S, ex), this.ormView(S, ex))
    return out
  },

  onLoad(query) {
    const p = pageParams(query)
    const ex = p.ex || (query.id ? exOr(query.id) : null)
    if (!ex) { wx.navigateBack(); return }
    this.exParam = ex
    this.exId = ex.id
    // The calculator starts from your best set, else the weight you last used, else 20 × 5.
    const S = getS()
    const best = best1RM(S, ex.id)
    this.orm = { w: best ? best.w : ((S.exWeights || {})[ex.id] || {}).w || 20, r: best ? best.r : 5 }
    this.offLang = onLangChange(() => this.__refresh && this.__refresh())
    this.__refresh()
    if (isCustomEx(ex) && ex.media) mediaStore.ready().then(() => this.__refresh && this.__refresh()).catch(() => {})
  },
  onUnload() {
    if (this.offLang) this.offLang()
    releasePage(this.query)
  },

  /* ---------- views ---------- */
  mediaView(m) {
    const path = h => { try { return (h && mediaStore.pathNow(h)) || '' } catch (e) { return '' } }
    if (m.kind === 'video') {
      const src = path(m.hash)
      return src ? { kind: 'video', src, poster: path(m.poster && m.poster.hash) } : null
    }
    const src = path(m.hash) || path(m.poster && m.poster.hash)
    return src ? { kind: 'image', src, poster: '' } : null
  },

  // BarWeightEditor without a routine config: the equipment alone decides the default kind.
  platesView(S, ex) {
    if (modeOf({ id: ex.id }) !== 'reps') return { plates: false }
    const unit = S.unit
    const bar = usesBar(ex)
    const kind = loadKindFor(S, { id: ex.id })
    const explicit = hasBarOverride(S, ex.id)
    const noBar = bar && isNoBar(S, ex.id)
    const def = defaultBarWeight(ex.eq, unit)
    const extra = t('You still log the total weight. This only feeds the plate line under each set.')
    const note = noBar ? t('Plates are counted from 0. Turn this off for the default ({0}).', fmtNum(def) + ' ' + unit)
      : bar ? (explicit ? t('Set to 0 to go back to the default ({0}).', fmtNum(def) + ' ' + unit) : t('Default for this bar type.'))
        : t('The machine or sled itself, before any plate goes on. 0 if it is all plates.')
    return {
      plates: true,
      kindOpts: KIND_OPTS(),
      kind,
      kindNote: kind === 'pairs' ? t('Plates split over both sides of a bar.')
        : kind === 'single' ? t('One stack: a belt, a landmine, a plate-loaded machine, a sled.')
          : t('No plate line under the sets.'),
      isBar: bar,
      noBar,
      baseLabel: bar ? t('Bar ({0})', unit) : t('Base weight ({0})', unit),
      base: baseWeightFor(S, ex),
      baseNote: note + ' ' + extra,
    }
  },

  dbView(S, ex) {
    if (!isBellEx(ex)) return { bell: false }
    const value = dbLoadFor(S, ex.id)
    const one = isOneArm({ id: ex.id })
    return {
      bell: true,
      dbOpts: DB_OPTS(),
      dbLoad: value,
      dbNote: value === 'each' ? (one ? t('The weight of the one you hold. One arm, so it counts once.') : t('The weight of one, so 20 means 20 in each hand. Volume counts both.'))
        : value === 'total' ? t('Both together, so 40 means two 20s.')
          : t('Counted as you type it, the way it always was.'),
    }
  },

  // No one-rep max on an assistance machine (the load is the help) nor on cardio.
  ormView(S, ex) {
    if (isCardio(ex) || isAssisted(ex)) return { orm: false }
    const unit = S.unit
    const best = best1RM(S, ex.id)
    const { w, r } = this.orm
    const formula = formulaOf(S)
    const est = estimate1RM(w, r, formula)
    return {
      orm: true,
      ormFrom: best ? fmtNum(best.est) + ' ' + unit : '',
      ormFromDim: best ? ' · ' + t('{0} × {1} on {2}', fmtNum(best.w) + ' ' + unit, best.r, fmtDate(best.d, true)) : '',
      w, r,
      wLabel: t('Weight ({0})', unit),
      est: est === null ? '–' : fmtNum(est) + ' ' + unit,
      estNote: est === null ? t('Enter a weight and 1–{0} reps. Beyond that it’s basically guesswork.', REP_CAP)
        : formula === 'weighted' ? t('A blend of seven formulas: calculated from one set, not a tested max.')
          : t('{0} formula: calculated from one set, not a tested max.', FORMULA_NAMES[formula]),
    }
  },

  /* ---------- actions ---------- */
  onFav() {
    let on = false
    update(s => { on = toggleFav(s, this.ex.id) })
    toast(on ? t('Added to favourites') : t('Removed from favourites'))
  },
  onAdd() { addToRoutineSheet(this.ex) },
  onHistory() { exerciseHistorySheet(this.ex.id) },
  onEdit() {
    const ex = this.ex
    backThen(this, () => customExSheet(ex))
  },
  onDelete() {
    deleteCustomEx(this.ex, () => wx.navigateBack())
  },
  onCopyLink() {
    const link = this.data.link
    if (!link) return
    wx.setClipboardData({ data: link })
  },
  onPreview() {
    const m = this.data.media
    if (m && m.kind === 'image') wx.previewImage({ urls: [m.src], current: m.src })
  },

  // Picking what the equipment already implies puts the exercise back on it (a stamped null).
  onKind(e) {
    const k = e.detail.value
    const ex = this.ex
    const defaults = isBodyweightEq(ex.id)
      ? [true, false].map(b => loadKindFor(null, { id: ex.id, bodyweight: b }))
      : [loadKindFor(null, { id: ex.id })]
    update(s => { s.loadKind = withLoadKind(s.loadKind, ex.id, defaults.every(d => d === k) ? null : k) })
  },
  onBase(e) {
    const v = e.detail.value
    const id = this.ex.id
    update(s => {
      s.barWeights = s.barWeights || {}
      const n = Math.max(0, Math.round((v || 0) * 100) / 100)
      if (n > 0) s.barWeights[id] = n; else delete s.barWeights[id]
    })
  },
  // "No bar" is a stored 0 (issue #138); clearing it goes back to the bar type's default.
  onNoBar(e) {
    const on = e.detail.value
    const id = this.ex.id
    update(s => {
      s.barWeights = s.barWeights || {}
      if (on) s.barWeights[id] = 0; else delete s.barWeights[id]
    })
  },
  onDbLoad(e) {
    const v = e.detail.value
    const id = this.ex.id
    update(s => { s.dbLoad = withDbLoad(s.dbLoad, id, v) })
  },
  onW(e) {
    const v = e.detail.value
    this.orm.w = v == null ? 0 : v
    this.__refresh()
  },
  onR(e) {
    const v = e.detail.value
    this.orm.r = v == null ? 0 : v
    this.__refresh()
  },
}))
