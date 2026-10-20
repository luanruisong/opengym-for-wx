// The Library tab (frontend/src/views/Library.jsx): the whole catalogue plus your own exercises,
// searched (Chinese and English names, lib/i18n exerciseNameSearchText via searchExercises),
// narrowed by body part, type and equipment, favourites first. The filtered list is kept in JS
// and drawn 50 rows at a time (createPager); the next batch comes on reaching the bottom or on
// "显示更多".
import { connectPage } from '../../utils/page.js'
import { useStore } from '../../store/store.js'
import { afterSheet } from '../../store/actions.js'
import { navTo } from '../../utils/nav.js'
import { exerciseDetailSheet, addToRoutineSheet, customExSheet } from '../../utils/sheets.js'
import { EXDB, allExercises, equipmentOf, byCategory, searchExercises, similarExercises } from '../../lib/exercises.js'
import { activeProfile, exAvailable } from '../../lib/equipment.js'
import { bestWeightFor } from '../../lib/history.js'
import { fmtNum, exCount } from '../../lib/format.js'
import { t, tn, onLangChange } from '../../lib/i18n.js'
import { sortFavouritesFirst, sortYoursFirst, usageOf } from '../../lib/favourites.js'
import { mediaStore } from '../../lib/media-store.js'
import { exRow, exById, bodypartChips, labelChips, debounce, createPager, anyCustomMedia } from './shared.js'

const getS = () => useStore.getState().S

Page(connectPage({
  data: {
    resting: false,
    cards: false,
    countLine: '',
    q: '',
    qOn: false,
    narrowed: false,
    countStr: '',
    hasProfile: false,
    profileLine: '',
    profileBtn: '',
    bp: '',
    bpChips: [],
    catOn: '',
    catChips: [],
    eqOn: '',
    eqChips: [],
    rows: [],
    hasMore: false,
    empty: false,
    similar: [],
    similarLabel: '',
  },

  mapState(S, { ui }) {
    // A change to the state (a favourite, a new custom exercise, a logged best) re-runs the
    // filter, keeping as many rows on screen as there were.
    if (this.pager && S !== this._S) { this._S = S; this.schedule(true) }
    const own = (S.customEx || []).filter(c => c && c.id).length
    // The original's count says "with animations"; this build has none, so it is a plain count.
    const countLine = own
      ? tn('{1} animated exercises + 1 of your own', '{1} animated exercises + {0} of your own', own, EXDB.length).replace('动画动作', '动作')
      : exCount(EXDB.length)
    return {
      resting: !!(ui.timer || ui.work),
      cards: S.exerciseView === 'cards',
      countLine,
    }
  },

  onLoad() {
    this.st = { q: '', bp: '', eq: '', cat: '', showAll: false }
    this.pager = createPager(this, 'rows')
    this._S = getS()
    this.search = debounce(() => this.recompute(false), 150)
    this.offLang = onLangChange(() => this.schedule(true))
    this.setData({ bpChips: bodypartChips() })
    this.recompute(false)
    // A custom exercise's picture is found by the media index, which loads on first use.
    if (anyCustomMedia(getS())) mediaStore.ready().then(() => this.schedule(true)).catch(() => {})
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setData({ selected: 3 })
  },

  onUnload() {
    if (this.offLang) this.offLang()
    if (this.search) this.search.cancel()
    clearTimeout(this._tm)
  },

  onReachBottom() { this.onMore() },

  // Coalesces bursts of store changes into one recompute.
  schedule(keep) {
    clearTimeout(this._tm)
    this._tm = setTimeout(() => this.recompute(keep), 30)
  },

  recompute(keepShown) {
    if (!this.pager) return
    const S = getS()
    const { q, bp, eq, cat, showAll } = this.st
    const profile = activeProfile(S)
    const inPart = searchExercises(allExercises(S).filter(e => !bp || e.bp === bp), q)
    // Kind of exercise: a choice the search or body part narrowed away is ignored for now.
    const { opts: catOpts, on: catOn, list: base } = byCategory(inPart, cat)
    const eqFiltered = (profile && !showAll) ? base.filter(e => exAvailable(S, e)) : base
    const eqOpts = equipmentOf(eqFiltered)
    // Drop the equipment filter if the search narrowed it away, so you never hit a dead end.
    const eqOn = eqOpts.includes(eq) ? eq : ''
    const narrowedList = eqOn ? eqFiltered.filter(e => e.eq === eqOn) : eqFiltered
    // Favourites first; while searching, the exercises you have logged or planned follow them.
    const usage = q.trim() ? usageOf(S) : null
    const f = usage ? sortYoursFirst(narrowedList, S, usage) : sortFavouritesFirst(narrowedList, S)
    this.profile = profile
    const make = e => {
      const best = bestWeightFor(S, e.id)
      return exRow(S, e, { best: best > 0 ? fmtNum(best) : '' })
    }
    const patch = this.pager.reset(f, make, keepShown)
    const narrowed = !!(q.trim() || bp || eqOn || catOn)
    Object.assign(patch, {
      narrowed,
      countStr: narrowed ? fmtNum(f.length) : '',
      hasProfile: !!profile,
      profileLine: profile ? (showAll ? t('Showing all equipment') : t('Showing what you have in "{0}"', profile.name)) : '',
      profileBtn: profile ? (showAll ? t('Filter by "{0}"', profile.name) : t('Show all equipment')) : '',
      bp,
      catOn,
      catChips: catOpts.length > 1 ? labelChips(catOpts) : [],
      eqOn,
      eqChips: eqOpts.length > 1 ? labelChips(eqOpts) : [],
    })
    this.finishPatch(patch)
  },

  // The "similar" rows and the flags that depend on how much of the list is on screen.
  finishPatch(patch) {
    const S = getS()
    const { q, bp, showAll } = this.st
    const f = this.pager.all
    const profile = this.profile
    // Close but not exact, under the results once they are all on screen.
    let similar = []
    if (q.trim() && f.length <= this.pager.shown) {
      const pool = allExercises(S).filter(e => (!bp || e.bp === bp) && (!profile || showAll || exAvailable(S, e)))
      similar = similarExercises(pool, q, f, f.length ? 12 : 30)
    }
    patch.similar = similar.map(e => {
      const best = bestWeightFor(S, e.id)
      return exRow(S, e, { best: best > 0 ? fmtNum(best) : '' })
    })
    patch.similarLabel = similar.length ? (f.length ? t('Similar exercises') : t('No exact match. These come close:')) : ''
    patch.empty = f.length === 0 && !similar.length
    patch.hasMore = this.pager.hasMore
    this.setData(patch)
  },

  onMore() {
    if (!this.pager || !this.pager.hasMore) return
    this.finishPatch(this.pager.more())
  },

  /* ---------- search & filters ---------- */
  onInput(e) {
    const v = e.detail.value
    this.st.q = v
    this.setData({ q: v, qOn: !!v })
    this.search()
  },
  onClear() {
    this.search.cancel()
    this.st.q = ''
    this.setData({ q: '', qOn: false })
    this.recompute(false)
  },
  onToggleView() {
    const cards = getS().exerciseView === 'cards'
    useStore.getState().update(s => { s.exerciseView = cards ? 'list' : 'cards' })
  },
  onShowAll() {
    this.st.showAll = !this.st.showAll
    this.recompute(false)
  },
  // Changing body part keeps the equipment filter (issue #71); "All" clears it.
  onBp(e) {
    const v = e.currentTarget.dataset.v || ''
    this.st.bp = v
    if (!v) this.st.eq = ''
    this.recompute(false)
  },
  onCat(e) {
    this.st.cat = e.currentTarget.dataset.v || ''
    this.recompute(false)
  },
  onEq(e) {
    this.st.eq = e.currentTarget.dataset.v || ''
    this.recompute(false)
  },

  /* ---------- rows ---------- */
  onRow(e) {
    exerciseDetailSheet(exById(getS(), e.currentTarget.dataset.id))
  },
  onPlan(e) {
    addToRoutineSheet(exById(getS(), e.currentTarget.dataset.id))
  },
  onNew() {
    customExSheet(null, ex => { if (ex) afterSheet(() => exerciseDetailSheet(ex)) }, this.st.q.trim())
  },
  onByMuscle() {
    navTo('/muscles')
  },
}))
