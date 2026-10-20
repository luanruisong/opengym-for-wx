// Explore muscles (frontend/src/views/Muscles.jsx + components/MuscleExplorer.jsx, without onPick):
// tap a muscle on the map or in the chips, then search / narrow the exercises that train it.
// A row opens the exercise page, its 计划 button adds it to a routine.
//
// The result list is not part of mapState: it is sent in batches of 40 (data.batches[i]) so
// "show more" only sends the new rows.
import { connectPage } from '../../utils/page.js'
import { useStore } from '../../store/store.js'
import { exerciseDetailSheet, addToRoutineSheet } from '../../utils/sheets.js'
import { BODYPARTS, allExercises, equipmentOf, searchExercises } from '../../lib/exercises.js'
import { activeProfile, exAvailable } from '../../lib/equipment.js'
import { bestWeightFor } from '../../lib/history.js'
import { fmtNum, exCount } from '../../lib/format.js'
import { MUSCLES, MUSCLE_NAME, musclesOf } from '../../lib/muscles.js'
import { t, exerciseNameFor } from '../../lib/i18n.js'
import { isFav, sortFavouritesFirst } from '../../lib/favourites.js'

const BATCH = 40

Page(connectPage({
  data: {
    body: 'male', selected: '', q: '', profileLine: '', profileBtn: '', hasProfile: false,
    muscleChips: [], selTitle: '', narrowed: false, countText: '', countLabel: '',
    bpChips: [], bpAll: true, eqChips: [], eqAll: true, showEq: false,
    cards: false, empty: false, more: false, batches: [],
  },

  mapState(S) {
    // Page-local state (the original's useState); mapState runs before onLoad.
    if (!this.st) this.st = { selected: null, q: '', bp: '', eq: '', shown: BATCH, showAll: false }
    const st = this.st
    // A UI-store tick (the rest timer) re-runs this with the same S: nothing to redo.
    const memoKey = JSON.stringify(st)
    if (this._memo && this._memo.S === S && this._memo.key === memoKey) return this._memo.out
    const profile = activeProfile(S)
    // The catalogue (and its per-muscle counts) only when what it depends on changed: custom
    // exercises, the equipment profile, the "show all" toggle.
    const catKey = JSON.stringify([S.customEx, S.equipFilterOn, S.activeEquipId, S.equipProfiles, st.showAll])
    if (!this._cat || this._cat.key !== catKey) {
      const all = allExercises(S)
      const catalog = (profile && !st.showAll) ? all.filter(e => exAvailable(S, e)) : all
      const counts = {}
      MUSCLES.forEach(m => { counts[m] = 0 })
      catalog.forEach(e => { const ms = musclesOf(e); MUSCLES.forEach(m => { if (ms[m]) counts[m]++ }) })
      this._cat = { key: catKey, catalog, counts }
    }
    const { catalog, counts } = this._cat
    const sel = st.selected
    const targeted = sel ? catalog.filter(e => musclesOf(e)[sel]) : []
    const base = searchExercises(targeted.filter(e => !st.bp || e.bp === st.bp), st.q)
    const eqOpts = equipmentOf(base)
    const eqOn = eqOpts.includes(st.eq) ? st.eq : ''
    // Favourites float to the top of whatever the filters left.
    const exercises = sortFavouritesFirst(eqOn ? base.filter(e => e.eq === eqOn) : base, S)
    const narrowed = !!(st.q.trim() || st.bp || eqOn)

    // The list goes out on its own (renderList); re-send it when the filters or the profile changed.
    const listKey = JSON.stringify([sel, st.q, st.bp, eqOn, catKey])
    this._exercises = exercises
    this._S = S
    if (this._listKey !== listKey || this._listS !== S) {
      this._listKey = listKey
      this._listS = S
      setTimeout(() => this.renderList(), 0)
    }

    const out = {
      body: S.body === 'female' ? 'female' : 'male',
      selected: sel || '',
      q: st.q,
      hasProfile: !!profile,
      profileLine: profile ? (st.showAll ? t('Showing all equipment') : t('Showing what you have in "{0}"', profile.name)) : '',
      profileBtn: profile ? (st.showAll ? t('Filter by "{0}"', profile.name) : t('Show all equipment')) : '',
      muscleChips: MUSCLES.map(m => ({ m, label: t(MUSCLE_NAME[m]), n: counts[m] || 0, on: sel === m })),
      selTitle: sel ? t('Exercises for {0}', t(MUSCLE_NAME[sel])) : '',
      narrowed,
      countText: fmtNum(exercises.length),
      countLabel: exCount(exercises.length),
      bpAll: !st.bp,
      bpChips: BODYPARTS.map(b => ({ b, label: t(b), on: st.bp === b })),
      showEq: eqOpts.length > 1,
      eqAll: !eqOn,
      eqChips: eqOpts.map(x => ({ x, label: t(x), on: eqOn === x })),
      cards: S.exerciseView === 'cards',
      empty: !!sel && exercises.length === 0,
      more: exercises.length > st.shown,
    }
    this._memo = { S, key: memoKey, out }
    return out
  },

  rowOf(e, S) {
    const sel = this.st.selected
    const name = exerciseNameFor(e)
    const best = bestWeightFor(S, e.id)
    const primary = musclesOf(e)[sel] === 1
    return {
      id: e.id,
      name,
      initial: (name || '?').trim().charAt(0).toUpperCase(),
      fav: isFav(S, e.id),
      sub: t(primary ? 'Primary target' : 'Also trains') + ' · ' + t(MUSCLE_NAME[e.tg] || e.tg || e.bp) + ' · ' + t(e.eq),
      best: best > 0 ? fmtNum(best) : '',
    }
  },

  // Every batch up to `shown`, after the filters (shown is back to 40 then) or the profile
  // changed (a favourite, a best). "Show more" sends only the new batch (showMore).
  renderList() {
    const S = this._S || useStore.getState().S
    const list = (this._exercises || []).slice(0, this.st.shown)
    const batches = []
    for (let i = 0; i < list.length; i += BATCH) batches.push(list.slice(i, i + BATCH).map(e => this.rowOf(e, S)))
    this.setData({ batches })
    this._sent = batches.length
  },

  showMore() {
    if (!this._exercises || this._exercises.length <= this.st.shown) return
    this.st.shown += BATCH
    const S = this._S || useStore.getState().S
    const from = this._sent || 0
    const patch = {}
    const list = this._exercises.slice(0, this.st.shown)
    let i = from
    for (let k = from * BATCH; k < list.length; k += BATCH, i++) patch['batches[' + i + ']'] = list.slice(k, k + BATCH).map(e => this.rowOf(e, S))
    this._sent = i
    patch.more = this._exercises.length > this.st.shown
    this.__last && (this.__last.more = JSON.stringify(patch.more))
    this.setData(patch)
  },
  onReachBottom() { this.showMore() },
  onMore() { this.showMore() },

  refresh() { this.__refresh && this.__refresh() },

  pick(m) {
    this.st.selected = m === this.st.selected ? null : m
    this.st.eq = ''
    this.st.shown = BATCH
    this.refresh()
  },
  onMap(e) { if (e.detail && e.detail.part) this.pick(e.detail.part) },
  onMuscle(e) { this.pick(e.currentTarget.dataset.m) },
  onClearSel() { if (this.st.selected) this.pick(this.st.selected) },
  onToggleAll() {
    this.st.showAll = !this.st.showAll
    this.st.eq = ''
    this.st.shown = BATCH
    this.refresh()
  },
  onQ(e) { this.st.q = e.detail.value || ''; this.st.shown = BATCH; this.refresh() },
  onClearQ() { this.st.q = ''; this.st.shown = BATCH; this.refresh() },
  // Changing body part keeps the equipment filter (it only drops out of view when the new body
  // part has nothing under it); "All" clears it, since it spans every body part.
  onBpAll() { this.st.bp = ''; this.st.eq = ''; this.st.shown = BATCH; this.refresh() },
  onBp(e) { this.st.bp = e.currentTarget.dataset.b; this.st.shown = BATCH; this.refresh() },
  onEqAll() { this.st.eq = ''; this.st.shown = BATCH; this.refresh() },
  onEq(e) { this.st.eq = e.currentTarget.dataset.x; this.st.shown = BATCH; this.refresh() },
  onView() {
    useStore.getState().update(s => { s.exerciseView = s.exerciseView === 'cards' ? 'list' : 'cards' })
  },
  exOf(e) {
    const id = e.currentTarget.dataset.id
    return (this._exercises || []).find(x => x.id === id)
  },
  onDetail(e) { const ex = this.exOf(e); if (ex) exerciseDetailSheet(ex) },
  onPlan(e) { const ex = this.exOf(e); if (ex) addToRoutineSheet(ex) },
}))
