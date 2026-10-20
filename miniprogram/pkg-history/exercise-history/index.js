// One exercise's past (frontend/src/sheets.jsx ExerciseHistory, issue #43): the curve first, then
// the last sessions set by set. params (pageParams): { exId } — utils/sheets.js#exerciseHistorySheet.
// Opened from a running workout too, so the history is derived once per log change
// (exerciseHistory on S.workouts), not on every store tick.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage } from '../../utils/nav.js'
import { exOr } from '../../lib/exercises.js'
import { exerciseHistory } from '../lib/exercise-history.js'
import { setLabel } from '../../lib/history.js'
import { fmtDate, fmtNum, fmtVol } from '../../lib/format.js'
import { speedUnitOf } from '../../lib/speed.js'
import { t, tn, exerciseNameFor } from '../../lib/i18n.js'

Page(connectPage({
  data: {
    name: '', total: 0, sub: '', showToggle: false, curve: 'top', curveOpts: [],
    pts: [], unit: '', bestText: '', secTitle: '', sessions: [],
  },

  exId() {
    if (this._exId === undefined) this._exId = pageParams(this.query).exId || (this.query && this.query.exId) || null
    return this._exId
  },

  mapState(S) {
    const exId = this.exId()
    if (!exId) return { total: 0 }
    const ex = exOr(exId)
    const name = exerciseNameFor(ex)
    if (!this._h || this._h.workouts !== S.workouts || this._h.unit !== S.unit) {
      this._h = { workouts: S.workouts, unit: S.unit, h: exerciseHistory(S, exId) }
      this._ptsCache = null
    }
    const h = this._h.h
    if (name && name !== this._title) { this._title = name; wx.setNavigationBarTitle({ title: name }) }
    if (!h.total) return { name, total: 0 }
    const curve = this.curve || 'top'
    const onE1 = curve === 'e1rm' && h.e1rmPoints.length > 0
    const unit = h.metric === 'weight' ? S.unit : h.metric === 'reps' ? t('reps') : h.metric === 'sec' ? 's' : t('min')
    const e1Best = Math.max(0, ...h.e1rmPoints.map(p => p.y))
    const speedUnit = speedUnitOf(S)
    const tail = s => [
      s.volume > 0 && t('Volume') + ' ' + fmtVol(s.volume, S.unit),
      s.e1rm != null && t('Est. 1RM') + ' ' + fmtNum(s.e1rm) + ' ' + S.unit,
    ].filter(Boolean).join(' · ')
    return {
      name,
      total: h.total,
      sub: t('Exercise history') + ' · ' + tn('{0} session', '{0} sessions', h.total),
      // Only reps work with a load produces an estimate, so the toggle is absent for the rest.
      showToggle: h.e1rmPoints.length > 0 && h.metric === 'weight',
      curve,
      curveOpts: [{ value: 'top', label: t('Top set') }, { value: 'e1rm', label: t('Est. 1RM') }],
      pts: (onE1 ? h.e1rmPoints : h.points).map(p => ({ t: p.t, y: p.y, d: p.d })),
      unit: onE1 ? S.unit : unit,
      bestText: fmtNum(onE1 ? e1Best : h.best) + ' ' + (onE1 ? S.unit : unit),
      secTitle: h.sessions.length < h.total ? t('Last {0} sessions', h.sessions.length) : t('Sessions'),
      sessions: h.sessions.map((s, i) => ({
        k: String(s.id != null ? s.id : i) + '-' + i,
        date: fmtDate(s.d, true),
        pr: !!s.pr,
        sets: (s.sets || []).map(x => setLabel(exId, x, s.target, speedUnit)).join('  ·  '),
        tail: tail(s),
        value: s.value != null && s.value > 0 ? fmtNum(s.value) + ' ' + unit : '',
      })),
    }
  },

  onCurve(e) {
    this.curve = e.detail.value
    this.__refresh && this.__refresh()
  },

  onUnload() { releasePage(this.query) },
}))
