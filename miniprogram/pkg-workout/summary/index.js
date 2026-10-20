// FinishSummary (frontend/src/sheets.jsx): the workout just filed. Opened by store/actions.js
// doFinishWorkout in the workout page's place; params { w, prs, e1prs }. The photos and videos
// section adds straight onto the saved record. '太棒了！' goes home.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage, navTo } from '../../utils/nav.js'
import { EXIDX } from '../../lib/exercises.js'
import { t, exerciseNameFor } from '../../lib/i18n.js'
import { fmtDur, fmtVol, fmtNum, setsWorkCount } from '../../lib/format.js'
import { setsDone, workSetsDone, setLabel } from '../../lib/history.js'
import { loadOfWorkouts } from '../../lib/muscles.js'
import { finishCompare, finishCardio } from '../lib/finish-compare.js'
import { speedUnitOf } from '../../lib/speed.js'
import { setsLine } from '../../store/actions.js'
import { useStore } from '../../store/store.js'

const nameOf = id => (EXIDX[id] ? exerciseNameFor(EXIDX[id]) : String(id))
const TREND = { 1: ['arrowUp', 'var(--green)'], 0: ['minus', 'var(--label-2)'], '-1': ['arrowDown', 'var(--orange)'] }

Page(connectPage({
  data: { ready: false },
  mapState(S) {
    const p = pageParams(this.query)
    const w = p.w
    if (!w) return {}
    const unit = S.unit
    const nextWord = { up: t('step up'), hold: t('same again'), down: t('lighter'), deload: t('deload') }
    const compare = finishCompare(S, w).map(row => {
      const tr = row.trend == null ? null : TREND[String(row.trend)]
      let next = ''
      if (row.next) {
        const n = row.next
        next = t('Next time') + ': ' + (n.w != null ? fmtNum(n.w) + ' ' + unit : '') + (n.w != null && n.r != null ? ' × ' : '') +
          (n.r != null ? n.r : '') + ' · ' + nextWord[n.kind]
      }
      return {
        id: row.id, name: nameOf(row.id),
        trendIcon: tr ? tr[0] : '', trendColor: tr ? tr[1] : '',
        today: t('Today') + ': ' + setsLine(row.today, unit),
        last: row.last ? t('Last time') + ': ' + setsLine(row.last, unit) : '',
        next,
      }
    })
    const cardio = finishCardio(w).map((row, i) => ({
      k: i, name: nameOf(row.id),
      sets: row.sets.map(x => setLabel(row.id, x, row.target, speedUnitOf(S))).join('  ·  '),
    }))
    return { compare, cardio, body: S.body || 'male' }
  },
  onLoad(query) {
    const p = pageParams(query)
    this.params = p
    const w = p.w
    if (!w) { navTo('/home'); return }
    const unit = useStore.getState().S.unit
    const prs = p.prs || []
    const e1prs = p.e1prs || []
    this.setData({
      ready: true,
      w,
      duration: fmtDur(w.end - w.start),
      volume: fmtVol(w.vol || 0, unit),
      sets: setsWorkCount(setsDone(w), workSetsDone(w)),
      prCount: prs.length ? String(prs.length) : '–',
      prs: prs.map((id, i) => ({ k: i, name: nameOf(id) })),
      e1prs: e1prs.map((x, i) => ({ k: i, name: nameOf(x.id), est: fmtNum(x.est) + ' ' + unit })),
      hasPrs: prs.length > 0 || e1prs.length > 0,
      load: loadOfWorkouts([w]),
    })
  },
  onUnload() { releasePage(this.query) },
  onNice() {
    if (this.done) return
    this.done = true
    navTo('/home')
  },
}))
