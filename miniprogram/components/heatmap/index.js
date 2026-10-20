// <heatmap> — the "Activity (last 12 months)" grid, port of frontend/src/components/Heatmap.jsx.
// It reads the store itself (S.workouts, S.dayNotes, S.weekStart, S.unit) through
// connectComponent, exactly as the original took S, so a page only drops it in:
//
//   <heatmap metric="{{hmMetric}}" bind:metricchange="onHmMetric" bind:day="onHmDay" />
//
// properties
//   metric  String  'time' | 'vol'. Empty (default) = S.heatmapMetric, and the switch above the
//                   grid then changes it locally. Stats passes S.heatmapMetric and stores the
//                   choice in bind:metricchange (useStore.update(s => { s.heatmapMetric = m })).
//
// events
//   bind:metricchange  { metric }          the Time / Volume switch was tapped
//   bind:day           { iso, title }      a day with a workout or a day note was tapped
//                                          (title: '2026-10-20 · 1 次训练 · 52 分钟 · 8,400 kg').
//                                          Stats: one workout → workoutDetailSheet, several →
//                                          calendarSheet(iso), none (note only) → dayOverrideSheet(iso).
//
// 53 week columns × 7 cells, the newest week at the right; the strip opens scrolled to it.
import { connectComponent } from '../../utils/page.js'
import { isoOf, todayISO, weekStartOf, weekDayOffset, fmtNum } from '../../lib/format.js'
import { workoutDay, workoutDuration, workoutVolume } from '../../lib/history.js'
import { dayNoteOf, dayNoteLine } from '../../lib/day-notes.js'
import { t, tn } from '../../lib/i18n.js'

const normalizeMetric = v => (v === 'vol' ? 'vol' : 'time')
const DAY_LABEL = { 1: '周一', 3: '周三', 5: '周五' }

const volumeOf = w => {
  if (Array.isArray(w && w.entries)) return Math.max(0, Number(workoutVolume(w)) || 0)
  const v = Number(w && w.vol)
  return Number.isFinite(v) ? Math.max(0, v) : 0
}

function aggregate(workouts) {
  const agg = {}
  ;(workouts || []).forEach(w => {
    const day = workoutDay(w)
    if (!day) return
    const a = agg[day] = agg[day] || { n: 0, vol: 0, min: 0 }
    a.n++
    a.vol += volumeOf(w)
    a.min += Math.max(0, Math.round(workoutDuration(w) / 60000))
  })
  return agg
}

function build(S, metric, agg) {
  const mv = metric === 'vol' ? 'vol' : 'min'
  const values = Object.keys(agg).map(k => agg[k][mv]).filter(v => v > 0).sort((a, b) => a - b)
  const q = p => (values.length ? values[Math.min(values.length - 1, Math.floor(p * values.length))] : 0)
  const t1 = q(0.25), t2 = q(0.5), t3 = q(0.75)
  const level = a => (!a ? 0 : !a[mv] ? 1 : a[mv] >= t3 ? 4 : a[mv] >= t2 ? 3 : a[mv] >= t1 ? 2 : 1)

  const today = new Date(); today.setHours(12, 0, 0, 0)
  const tIso = todayISO()
  const ws = weekStartOf(S)
  const end = new Date(today); end.setDate(today.getDate() - weekDayOffset(today.getDay(), ws))
  const start = new Date(end); start.setDate(end.getDate() - 52 * 7)

  const days = Array.from({ length: 7 }, (_, i) => ({ k: 'd' + i, txt: '' }))
  ;[1, 3, 5].forEach(d => { days[weekDayOffset(d, ws)].txt = DAY_LABEL[d] })

  const months = [], cols = []
  let lastMonth = -1
  for (let wk = 0; wk <= 52; wk++) {
    const colStart = new Date(start); colStart.setDate(start.getDate() + wk * 7)
    const mo = colStart.getMonth()
    const showM = mo !== lastMonth && colStart.getDate() <= 7 && wk < 51
    months.push({ k: 'm' + wk, txt: showM ? (mo + 1) + '月' : '' })
    if (colStart.getDate() <= 7) lastMonth = mo
    const cells = []
    for (let d = 0; d < 7; d++) {
      const day = new Date(colStart); day.setDate(colStart.getDate() + d)
      const key = isoOf(day)
      const a = agg[key]
      const note = !a && dayNoteOf(S, key)
      cells.push({
        k: key,
        c: 'l' + level(a) + (note ? ' noted' : '') + (key === tIso ? ' today' : '') + (day > today ? ' future' : ''),
        on: !!(a || note),
      })
    }
    cols.push({ k: 'w' + wk, cells })
  }
  return {
    metric,
    months, days, cols,
    lo: metric === 'vol' ? '较少总量' : '少',
    hi: metric === 'vol' ? '较多总量' : '多',
  }
}

Component(connectComponent({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    metric: { type: String, value: '' },
  },
  data: { hm: null, lastCol: '' },
  mapState(S) {
    const metric = normalizeMetric(this.properties.metric || this._metric || (S && S.heatmapMetric))
    // Rebuilt only when what it is drawn from changed (a store change elsewhere costs nothing).
    const key = metric + '|' + todayISO() + '|' + weekStartOf(S)
    const c = this._cache
    if (c && c.workouts === S.workouts && c.notes === S.dayNotes && c.unit === S.unit && c.key === key) return { hm: c.hm }
    const agg = aggregate(S.workouts)
    const hm = build(S, metric, agg)
    this._cache = { workouts: S.workouts, notes: S.dayNotes, unit: S.unit, key, hm }
    this._agg = agg
    this._S = S
    return { hm }
  },
  observers: {
    metric() { if (this.__refresh) this.__refresh() },
    // open on the newest week, once the grid is on screen
    hm(hm) {
      if (!hm || this._scrolled) return
      this._scrolled = true
      setTimeout(() => this.setData({ lastCol: 'hmw52' }), 60)
    },
  },
  methods: {
    onMetric(e) {
      const next = normalizeMetric(e.currentTarget.dataset.m)
      if (this.data.hm && next === this.data.hm.metric) return
      if (!this.properties.metric) { this._metric = next; if (this.__refresh) this.__refresh() }
      this.triggerEvent('metricchange', { metric: next })
    },
    onCell(e) {
      const { iso, on } = e.currentTarget.dataset
      if (!on) return
      const a = this._agg && this._agg[iso]
      const S = this._S || {}
      let title = iso
      try {
        if (a) title += ' · ' + tn('{0} workout', '{0} workouts', a.n) + ' · ' + t('{0} min', a.min) + ' · ' + fmtNum(a.vol) + ' ' + (S.unit || 'kg')
        else {
          const note = dayNoteOf(S, iso)
          if (note) title += ' · ' + dayNoteLine(note, t)
        }
      } catch (err) { /* title is a nicety */ }
      this.triggerEvent('day', { iso, title })
    },
  },
}))
