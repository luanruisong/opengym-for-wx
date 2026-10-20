// The exercise picker (frontend/src/sheets.jsx ExercisePicker), opened by
// utils/sheets.js#exercisePicker(onPick, { title, like }).
//
// params: onPick(ex, quick)  quick = true for the row's "+" (add with the default config now),
//                            undefined for a tap on the row (the caller opens its config next)
//         title              names what the pick is for when it is not an add (Replace, Swap…)
//         like               the exercise id a swap/replace is away from: the list opens on the
//                            ones training the same muscle (#473)
//
// A pick calls onPick, then the page goes back on its own (sheet-finish.js: it waits for a page
// onPick opened to come back first). Picks are taken once.
//
// The filtered list stays in JS; 50 rows are drawn at a time and the next batch comes at the
// bottom of the page (onReachBottom) or from "显示更多". "按肌肉" switches the page to the muscle
// explorer (components/MuscleExplorer.jsx with onPick): a body map, the muscles with their counts,
// and the exercises for the one chosen.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage } from '../../utils/nav.js'
import { useStore } from '../../store/store.js'
import { customExSheet } from '../../utils/sheets.js'
import { EXIDX, allExercises, equipmentOf, byCategory, searchExercises, similarExercises } from '../../lib/exercises.js'
import { activeProfile, exAvailable } from '../../lib/equipment.js'
import { fmtNum } from '../../lib/format.js'
import { t, exerciseNameFor, onLangChange } from '../../lib/i18n.js'
import { MUSCLES, MUSCLE_NAME, musclesOf } from '../../lib/muscles.js'
import { isFav, sortFavouritesFirst, sortYoursFirst, usageOf } from '../../lib/favourites.js'
import { sameMuscleFirst, swapMuscleOf } from '../lib/similar-exercises.js'
import { mediaStore } from '../../lib/media-store.js'
import { exRow, exById, bodypartChips, labelChips, debounce, createPager, anyCustomMedia, topPage } from '../../pages/library/shared.js'
import { finishSheet, sheetShown, sheetHidden, sheetUnloaded } from '../sheet-finish.js'

const getS = () => useStore.getState().S
const SAME = '≈'      // the swapped exercise's target muscle
const CHOSEN = '★'    // already in a routine or a log
const FAVS = '☆'      // favourites

Page(connectPage({
  data: {
    cards: false,
    resting: false,
    mode: 'main',            // 'main' | 'muscle'
    placeholder: '',
    q: '',
    qOn: false,
    narrowed: false,
    countStr: '',
    hasProfile: false,
    profileLine: '',
    profileBtn: '',
    likeLabel: '',
    favLabel: '',
    chosenLabel: '',
    bp: '',
    bpChips: [],
    catOn: '',
    catChips: [],
    eqOn: '',
    eqChips: [],
    special: false,
    rows: [],
    hasMore: false,
    emptyChosen: false,
    emptyFav: false,
    emptyMatch: false,
    similar: [],
    similarLabel: '',
    // the muscle explorer
    body: 'male',
    muscle: '',
    muscleChips: [],
    muscleTitle: '',
  },

  mapState(S, { ui }) {
    if (this.pager && S !== this._S) { this._S = S; this.schedule(true) }
    return {
      cards: S.exerciseView === 'cards',
      resting: !!(ui.timer || ui.work),
      body: S.body === 'female' ? 'female' : 'male',
    }
  },

  onLoad(query) {
    const p = pageParams(query)
    this.params = p
    const S = getS()
    this._S = S
    wx.setNavigationBarTitle({ title: String(p.title || t('Add exercise')) })
    // What a swap is away from: the list opens on what trains the same muscle, if anything you
    // can use does; "全部" is one tap back to everything. A muscle nothing else trains gets no chip.
    const all = allExercises(S)
    const likeEx = p.like ? (EXIDX[p.like] || all.find(e => e.id === p.like) || null) : null
    const likeTg = swapMuscleOf(likeEx) && sameMuscleFirst(all, likeEx).length ? swapMuscleOf(likeEx) : ''
    this.likeEx = likeEx
    this.likeTg = likeTg
    let bp = ''
    if (likeTg) {
      const prof = activeProfile(S)
      bp = sameMuscleFirst(all, likeEx).some(e => !prof || exAvailable(S, e)) ? SAME : ''
    }
    this.st = { q: '', bp, eq: '', cat: '', showAll: false }
    this.mst = { muscle: '', q: '', bp: '', eq: '', showAll: false }
    this.mode = 'main'
    this.pager = createPager(this, 'rows')
    this.search = debounce(() => this.recompute(false), 150)
    this.offLang = onLangChange(() => this.schedule(true))
    this.setData({
      bpChips: bodypartChips(),
      likeLabel: likeTg ? t('Same muscle: {0}', t(MUSCLE_NAME[likeTg] || likeTg)) : '',
    })
    this.recompute(false)
    if (anyCustomMedia(S)) mediaStore.ready().then(() => this.schedule(true)).catch(() => {})
  },
  onShow() {
    sheetShown(this)
    // A custom exercise made from here comes back once this page is on top again.
    if (this.pendingPick) {
      const ex = this.pendingPick
      this.pendingPick = null
      this.choose(ex)
    }
  },
  onHide() { sheetHidden(this) },
  onUnload() {
    sheetUnloaded(this)
    if (this.offLang) this.offLang()
    if (this.search) this.search.cancel()
    clearTimeout(this._tm)
    releasePage(this.query)
  },
  onReachBottom() { this.onMore() },

  schedule(keep) {
    clearTimeout(this._tm)
    this._tm = setTimeout(() => this.recompute(keep), 30)
  },

  recompute(keep) {
    if (!this.pager) return
    if (this.mode === 'muscle') this.recomputeMuscle(keep)
    else this.recomputeMain(keep)
  },

  recomputeMain(keepShown) {
    const S = getS()
    const { q, bp, eq, cat, showAll } = this.st
    const usage = usageOf(S)
    const all = allExercises(S)
    const profile = activeProfile(S)
    const inScope = e => bp === CHOSEN ? usage[e.id] : bp === FAVS ? isFav(S, e.id) : (!bp || e.bp === bp)
    let inPart = searchExercises(bp === SAME ? sameMuscleFirst(all, this.likeEx) : all.filter(inScope), q)
    if (bp === CHOSEN) inPart = [...inPart].sort((a, b) => (usage[b.id] - usage[a.id]) || exerciseNameFor(a).localeCompare(exerciseNameFor(b)))
    // The Library's Type row, with its fallback: a type narrowed away is ignored, not forgotten.
    const { opts: catOpts, on: catOn, list: base } = byCategory(inPart, cat)
    const eqFiltered = (profile && !showAll) ? base.filter(e => exAvailable(S, e)) : base
    const eqOpts = equipmentOf(eqFiltered)
    const eqOn = eqOpts.includes(eq) ? eq : ''
    // Favourites first; on the same-muscle list the equipment order wins (same kit first,
    // favourites leading within each half). While searching, what you logged or planned follows.
    const narrowedList = eqOn ? eqFiltered.filter(e => e.eq === eqOn) : eqFiltered
    const ranked = q.trim() ? sortYoursFirst(narrowedList, S, usage) : sortFavouritesFirst(narrowedList, S)
    const f = bp === SAME ? sameMuscleFirst(ranked, this.likeEx) : ranked
    const chosenCount = Object.keys(usage).length
    const favCount = (S.favEx || []).length
    const special = bp === CHOSEN || bp === FAVS
    const narrowed = !!(q.trim() || bp || eqOn || catOn)
    this.usage = usage
    this.profile = profile
    const make = e => exRow(S, e, { used: !!usage[e.id] })
    const patch = this.pager.reset(f, make, keepShown)
    Object.assign(patch, {
      mode: 'main',
      placeholder: t('Search {0} exercises…', all.length),
      narrowed,
      countStr: narrowed ? fmtNum(f.length) : '',
      hasProfile: !!profile,
      profileLine: profile ? (showAll ? t('Showing all equipment') : t('Showing what you have in "{0}"', profile.name)) : '',
      profileBtn: profile ? (showAll ? t('Filter by "{0}"', profile.name) : t('Show all equipment')) : '',
      favLabel: favCount > 0 ? t('Favourites') + ' (' + favCount + ')' : '',
      chosenLabel: chosenCount > 0 ? t('Chosen') + ' (' + chosenCount + ')' : '',
      bp,
      special,
      catOn,
      catChips: catOpts.length > 1 ? labelChips(catOpts) : [],
      eqOn,
      eqChips: eqOpts.length > 1 ? labelChips(eqOpts) : [],
      emptyChosen: f.length === 0 && bp === CHOSEN,
      emptyFav: f.length === 0 && bp === FAVS,
    })
    this.finishMain(patch)
  },

  finishMain(patch) {
    const S = getS()
    const { q, bp, showAll } = this.st
    const f = this.pager.all
    const special = bp === CHOSEN || bp === FAVS
    let similar = []
    if (q.trim() && !special && f.length <= this.pager.shown) {
      const all = allExercises(S)
      const pool = (this.profile && !showAll ? all.filter(e => exAvailable(S, e)) : all)
        .filter(e => bp === SAME || !bp || e.bp === bp)
      similar = similarExercises(pool, q, f, f.length ? 12 : 30)
    }
    const usage = this.usage || {}
    patch.similar = similar.map(e => exRow(S, e, { used: !!usage[e.id] }))
    patch.similarLabel = similar.length ? (f.length ? t('Similar exercises') : t('No exact match. These come close:')) : ''
    patch.emptyMatch = false
    patch.hasMore = this.pager.hasMore
    this.setData(patch)
  },

  /* ---------- the muscle explorer ---------- */
  recomputeMuscle(keepShown) {
    const S = getS()
    const { muscle, q, bp, eq, showAll } = this.mst
    const profile = activeProfile(S)
    // musclesOf once per exercise, for the counts and the selected muscle's list alike; kept
    // until the state or the equipment switch changes (a search or a chip reuses it).
    let c = this._mcache
    if (!c || c.S !== S || c.showAll !== showAll) {
      const all = allExercises(S)
      const catalog = (profile && !showAll) ? all.filter(e => exAvailable(S, e)) : all
      const maps = catalog.map(e => musclesOf(e))
      const counts = {}
      MUSCLES.forEach(m => { counts[m] = 0 })
      maps.forEach(mm => { for (const m of MUSCLES) if (mm[m]) counts[m]++ })
      c = this._mcache = { S, showAll, catalog, maps, counts }
    }
    const { catalog, maps, counts } = c
    const targeted = muscle ? catalog.filter((e, i) => maps[i][muscle]) : []
    const base = searchExercises(targeted.filter(e => !bp || e.bp === bp), q)
    const eqOpts = equipmentOf(base)
    const eqOn = eqOpts.includes(eq) ? eq : ''
    const list = sortFavouritesFirst(eqOn ? base.filter(e => e.eq === eqOn) : base, S)
    const narrowed = !!(q.trim() || bp || eqOn)
    const make = e => {
      const primary = musclesOf(e)[muscle] === 1
      const row = exRow(S, e)
      row.sub = t(primary ? 'Primary target' : 'Also trains') + ' · ' + row.sub
      return row
    }
    const patch = this.pager.reset(list, make, keepShown)
    Object.assign(patch, {
      mode: 'muscle',
      narrowed,
      countStr: narrowed ? fmtNum(list.length) : '',
      hasProfile: !!profile,
      profileLine: profile ? (showAll ? t('Showing all equipment') : t('Showing what you have in "{0}"', profile.name)) : '',
      profileBtn: profile ? (showAll ? t('Filter by "{0}"', profile.name) : t('Show all equipment')) : '',
      muscle,
      muscleTitle: muscle ? t('Exercises for {0}', t(MUSCLE_NAME[muscle])) : '',
      muscleChips: MUSCLES.map(m => ({ v: m, label: t(MUSCLE_NAME[m]), n: counts[m] })),
      bp,
      eqOn,
      eqChips: eqOpts.length > 1 ? labelChips(eqOpts) : [],
      catChips: [],
      catOn: '',
      special: false,
      emptyChosen: false,
      emptyFav: false,
      emptyMatch: !!muscle && list.length === 0,
      similar: [],
      similarLabel: '',
      hasMore: this.pager.hasMore,
    })
    this.setData(patch)
  },

  onByMuscle() {
    this.search.cancel()
    this.mode = 'muscle'
    this.setData({ q: this.mst.q, qOn: !!this.mst.q })
    this.recompute(false)
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  },
  onAll() {
    this.search.cancel()
    this.mode = 'main'
    this.setData({ q: this.st.q, qOn: !!this.st.q })
    this.recompute(false)
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  },
  onMuscle(e) {
    const m = (e.detail && e.detail.part) || e.currentTarget.dataset.v || ''
    if (!m) return
    this.mst.muscle = m === this.mst.muscle ? '' : m
    this.mst.eq = ''
    this.recompute(false)
  },
  onClearMuscle() {
    this.mst.muscle = ''
    this.mst.eq = ''
    this.recompute(false)
  },

  /* ---------- search & filters (both modes) ---------- */
  cur() { return this.mode === 'muscle' ? this.mst : this.st },
  onInput(e) {
    const v = e.detail.value
    this.cur().q = v
    this.setData({ q: v, qOn: !!v })
    this.search()
  },
  onClear() {
    this.search.cancel()
    this.cur().q = ''
    this.setData({ q: '', qOn: false })
    this.recompute(false)
  },
  onToggleView() {
    const cards = getS().exerciseView === 'cards'
    useStore.getState().update(s => { s.exerciseView = cards ? 'list' : 'cards' })
  },
  onShowAll() {
    const c = this.cur()
    c.showAll = !c.showAll
    if (this.mode === 'muscle') c.eq = ''
    this.recompute(false)
  },
  // Changing body part keeps the equipment filter (issue #71); the favourites / chosen chips
  // clear it (cross-body-part views); in the muscle explorer "全部" clears it.
  onBp(e) {
    const v = e.currentTarget.dataset.v || ''
    const c = this.cur()
    c.bp = v
    if (v === CHOSEN || v === FAVS || (this.mode === 'muscle' && !v)) c.eq = ''
    this.recompute(false)
  },
  onCat(e) {
    this.st.cat = e.currentTarget.dataset.v || ''
    this.recompute(false)
  },
  onEq(e) {
    this.cur().eq = e.currentTarget.dataset.v || ''
    this.recompute(false)
  },
  onMore() {
    if (!this.pager || !this.pager.hasMore) return
    const patch = this.pager.more()
    if (this.mode === 'muscle') { patch.hasMore = this.pager.hasMore; this.setData(patch) }
    else this.finishMain(patch)
  },

  /* ---------- picking ---------- */
  choose(ex, quick) {
    if (!ex) return
    const cb = this.params && this.params.onPick
    finishSheet(this, () => { if (typeof cb === 'function') cb(ex, quick) })
  },
  onRow(e) {
    this.choose(exById(getS(), e.currentTarget.dataset.id))
  },
  // The "+": adds with the default config right away (the row itself goes to the config).
  onQuick(e) {
    this.choose(exById(getS(), e.currentTarget.dataset.id), true)
  },
  onNew() {
    customExSheet(null, ex => {
      if (!ex) return
      // The form goes back before or after this runs: pick now when this page is on top again,
      // else as soon as it shows.
      if (topPage() === this) this.choose(ex)
      else this.pendingPick = ex
    }, this.st.q.trim())
  },
}))
