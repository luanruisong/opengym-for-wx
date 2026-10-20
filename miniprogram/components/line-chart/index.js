// <line-chart> — port of frontend/src/components/LineChart.jsx onto a canvas type="2d".
//
// properties
//   points  Array   [{ t: ms, y: number, d?: 'YYYY-MM-DD', m?: 0..1, note?: string }] sorted by t.
//                   m marks the dot (bigger + more solid = more of it; effort on the weight curve),
//                   note is extra tooltip text. With `series`, points only anchor the touch
//                   (one per date, its note the tooltip). Empty → "暂无数据".
//   series  Array   optional, several lines: [{ points: [{ t, y }], color }]. The first is drawn
//                   widest and underneath. Y axis spans every series.
//   h       Number  chart height in px (default 150). Width is the container's.
//   unit    String  appended to the tooltip value ('kg', '次'…)
//   color   String  line colour: a theme token ('acc', 'blue', 'yellow', 'label-2'…), the web
//                   app's 'var(--blue)', or a plain CSS colour ('#ff9f0a'). Default 'acc'.
//                   Series colours take the same forms.
//   axes    Boolean grid lines + labels (default true)
//   goal    Number|null  dashed yellow goal line (body weight target)
//   invert  Boolean flips the y axis (RIR: counts down as it gets harder)
//
// events
//   bind:select  { index, t, iso, v, note } when the touched point changes (index into points)
//
// Differences from the SVG original: the canvas is drawn in real px at `h` px tall (the SVG
// was a 340-wide viewBox scaled to the width), so text stays 10px on every screen. Touching or
// dragging across the chart selects the nearest date, like the web hover; the selection stays
// until the data changes. Dates are written the Chinese way (10月20日 周一).
import { connectComponent } from '../../utils/page.js'
import { themeColors } from '../../utils/theme.js'
import { fmtNum } from '../../lib/format.js'

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const pad2 = n => (n < 10 ? '0' : '') + n
const isoOf = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
function fmtDay(iso, withYear) {
  const d = new Date(iso + 'T12:00:00')
  if (isNaN(d.getTime())) return String(iso || '')
  return (withYear ? d.getFullYear() + '年' : '') + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK[d.getDay()]
}
const num = v => { try { return fmtNum(v) } catch (e) { return String(Math.round(v * 10) / 10) } }

const FALLBACK = {
  bg: '#000000', surface: '#1c1c1e', label: '#ffffff', label2: 'rgba(235,235,245,0.6)',
  label3: 'rgba(235,235,245,0.32)', sepOp: 'rgba(84,84,88,0.34)', yellow: '#ffd60a', acc: '#30d158',
}

// 'var(--label-2)' / 'label-2' / 'acc' → the theme's colour; anything else is used as given.
function resolveColor(c, colors, fallback) {
  if (!c) return fallback
  let s = String(c).trim()
  const m = s.match(/^var\(\s*--([\w-]+)\s*(?:,[^)]*)?\)$/)
  if (m) s = m[1]
  if (/^[a-z][\w-]*$/i.test(s)) {
    const k = s.replace(/-(\w)/g, (_, x) => x.toUpperCase())
    if (colors && colors[k]) return colors[k]
    if (m) return fallback
  }
  return s
}

// The colour at alpha `a`, or null when it cannot be parsed (a named colour).
function withAlpha(c, a) {
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c)
  if (m) {
    let h = m[1]
    if (h.length === 3) h = h.split('').map(x => x + x).join('')
    const n = parseInt(h, 16)
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(c)
  if (m) {
    const p = m[1].split(',').map(s => s.trim())
    const base = p[3] != null ? parseFloat(p[3]) : 1
    return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + base * a + ')'
  }
  return null
}

function pixelRatio() {
  try { return (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2 } catch (e) { return 2 }
}

Component(connectComponent({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    points: { type: Array, value: [] },
    series: { type: Array, value: [] },
    h: { type: Number, value: 150 },
    unit: { type: String, value: '' },
    color: { type: String, value: 'acc' },
    axes: { type: Boolean, value: true },
    goal: { type: null, value: null },
    invert: { type: Boolean, value: false },
  },
  data: { empty: true, tipText: '', tipStyle: '', colors: null },
  mapState(S) { return { colors: themeColors(S) } },
  observers: {
    'points, series, h, axes, goal, invert, color': function () {
      this._hover = null
      this.setData({ tipText: '' })
      this.schedule()
    },
    'unit, colors': function () { this.schedule() },
  },
  lifetimes: {
    ready() { this._ready = true; this.schedule() },
    detached() { clearTimeout(this._timer); this._cv = null },
  },
  methods: {
    schedule() {
      const pts = this.data.points
      const empty = !pts || pts.length === 0
      if (empty !== this.data.empty) {
        // the canvas comes and goes with the empty state, so it has to be looked up again
        this._cv = null
        this.setData({ empty }, () => this.schedule())
        return
      }
      if (empty || !this._ready) return
      clearTimeout(this._timer)
      this._timer = setTimeout(() => this.measure(), 16)
    },

    measure() {
      this.createSelectorQuery().select('#lc').fields({ node: true, size: true }).exec(res => {
        const r = res && res[0]
        if (!r || !r.node || !r.width) return
        const cv = r.node
        const dpr = this._dpr || (this._dpr = pixelRatio())
        const W = r.width, H = this.data.h
        if (this._cv !== cv || this._w !== W || this._h !== H) {
          cv.width = Math.round(W * dpr)
          cv.height = Math.round(H * dpr)
          this._cv = cv
          this._ctx = cv.getContext('2d')
          this._w = W
          this._h = H
        }
        this.layout()
        this.paint()
      })
    },

    // Geometry, as LineChart.jsx computes it, in px.
    layout() {
      const { points, series, axes, goal, invert } = this.data
      const W = this._w, H = this._h
      const P = { l: axes ? 34 : 8, r: 12, t: 10, b: axes ? 22 : 8 }
      const single = points.length === 1
      const pts = single ? [points[0], points[0]] : points
      const multi = Array.isArray(series) && series.length > 0
      const ys = multi ? [].concat(...series.map(s => (s.points || []).map(p => p.y))) : pts.map(p => p.y)
      let ymin = Math.min(...ys), ymax = Math.max(...ys)
      const hasGoal = goal != null && goal !== '' && isFinite(goal)
      if (hasGoal) { ymin = Math.min(ymin, +goal); ymax = Math.max(ymax, +goal) }
      if (!isFinite(ymin) || !isFinite(ymax)) { ymin = 0; ymax = 1 }
      if (ymin === ymax) { ymin -= 1; ymax += 1 }
      const padY = (ymax - ymin) * 0.12; ymin -= padY; ymax += padY
      const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1
      const X = tv => (t1 === t0 ? (P.l + W - P.r) / 2 : P.l + (tv - t0) / (t1 - t0) * (W - P.l - P.r))
      const Y = y => { const f = (y - ymin) / (ymax - ymin); return P.t + (invert ? f : 1 - f) * (H - P.t - P.b) }

      const yTicks = [], xTicks = []
      if (axes) {
        const raw = (ymax - ymin) / 3
        const pow = Math.pow(10, Math.floor(Math.log10(raw)))
        let step = 10 * pow
        for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * pow) { step = m * pow; break }
        for (let v0 = Math.ceil(ymin / step) * step; v0 <= ymax + 1e-9; v0 += step) {
          const v = Math.round(v0 / step) * step || 0
          yTicks.push({ y: Y(v), txt: num(v) })
        }
        const d0 = new Date(t0), d1 = new Date(t1)
        const ticks = []
        let m = new Date(d0.getFullYear(), d0.getMonth() + 1, 1)
        while (m <= d1) { ticks.push({ t: +m, txt: (m.getMonth() + 1) + '月' }); m = new Date(m.getFullYear(), m.getMonth() + 1, 1) }
        if (ticks.length === 0 && !single) {
          for (let i = 0; i <= 2; i++) {
            const tv = t0 + (t1 - t0) * i / 2, dd = new Date(tv)
            ticks.push({ t: tv, txt: (dd.getMonth() + 1) + '月' + dd.getDate() + '日', align: i === 0 ? 'left' : i === 2 ? 'right' : 'center' })
          }
        }
        const every = Math.max(1, Math.ceil(ticks.length / 7))
        ticks.forEach((tk, i) => { if (!(i % every)) xTicks.push({ x: X(tk.t), txt: tk.txt, align: tk.align || 'center' }) })
      }

      const src = single ? [points[0]] : points
      const dates = src.map(p => p.d || isoOf(new Date(p.t)))
      const years = {}
      dates.forEach(iso => { years[String(iso).slice(0, 4)] = 1 })
      const showYear = Object.keys(years).length > 1
      const hoverPts = src.map((p, i) => ({ i, x: X(p.t), y: Y(p.y), t: p.t, iso: dates[i], v: p.y, note: p.note }))
      this._geo = { W, H, P, X, Y, pts, multi, single, hasGoal, yTicks, xTicks, hoverPts, showYear,
        marked: points.some(p => p.m != null) }
    },

    paint() {
      const ctx = this._ctx, g = this._geo
      if (!ctx || !g) return
      const C = this.data.colors || FALLBACK
      const { W, H, P, X, Y, pts, multi } = g
      const dpr = this._dpr
      const color = resolveColor(this.data.color, C, C.acc)
      const grid = C.sepOp || C.sep, txt = C.label2
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      // grid + labels
      ctx.font = '10px sans-serif'
      ctx.lineWidth = 1
      ctx.strokeStyle = grid
      ctx.fillStyle = txt
      ctx.setLineDash([2, 4])
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'right'
      g.yTicks.forEach(tk => {
        ctx.beginPath(); ctx.moveTo(P.l, tk.y); ctx.lineTo(W - P.r, tk.y); ctx.stroke()
        ctx.fillText(tk.txt, P.l - 5, tk.y)
      })
      ctx.textBaseline = 'alphabetic'
      g.xTicks.forEach(tk => {
        ctx.beginPath(); ctx.moveTo(tk.x, P.t); ctx.lineTo(tk.x, H - P.b); ctx.stroke()
        ctx.textAlign = tk.align
        ctx.fillText(tk.txt, tk.x, H - 7)
      })

      // goal
      if (g.hasGoal) {
        const gy = Y(+this.data.goal)
        ctx.strokeStyle = C.yellow
        ctx.lineWidth = 1.6
        ctx.setLineDash([7, 4])
        ctx.beginPath(); ctx.moveTo(P.l, gy); ctx.lineTo(W - P.r, gy); ctx.stroke()
        ctx.fillStyle = C.yellow
        ctx.font = 'bold 10px sans-serif'
        ctx.textAlign = 'right'
        ctx.fillText(num(+this.data.goal), W - P.r - 2, gy - 5)
      }
      ctx.setLineDash([])

      const dot = (x, y, r, fill, ring) => {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = fill; ctx.fill()
        if (ring) { ctx.lineWidth = 2; ctx.strokeStyle = ring; ctx.stroke() }
      }
      const line = (list, stroke, width) => {
        ctx.beginPath()
        list.forEach((p, i) => { const x = X(p.t), y = Y(p.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y) })
        ctx.lineWidth = width; ctx.strokeStyle = stroke; ctx.stroke()
      }

      const series = this.data.series || []
      if (multi) {
        series.forEach((s, k) => {
          const sp = s.points || []
          const sc = resolveColor(s.color, C, color)
          const sw = 2 + (series.length - 1 - k) * 2.4
          if (sp.length > 1) line(sp, sc, sw)
          sp.forEach(p => dot(X(p.t), Y(p.y), sw / 2 + 1.2, sc))
        })
      } else {
        // area under the curve, fading down
        const last = pts[pts.length - 1]
        const top = withAlpha(color, 0.28), bottom = withAlpha(color, 0)
        ctx.beginPath()
        ctx.moveTo(P.l, H - P.b)
        pts.forEach(p => ctx.lineTo(X(p.t), Y(p.y)))
        ctx.lineTo(X(last.t), H - P.b)
        ctx.closePath()
        if (top) {
          const grad = ctx.createLinearGradient(0, P.t, 0, H - P.b)
          grad.addColorStop(0, top); grad.addColorStop(1, bottom)
          ctx.fillStyle = grad; ctx.fill()
        } else {
          ctx.globalAlpha = 0.14; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1
        }
        line(pts, color, 2.5)
        if (g.marked) {
          pts.forEach(p => {
            if (p.m == null) return
            ctx.globalAlpha = 0.3 + p.m * 0.7
            dot(X(p.t), Y(p.y), 2.4 + p.m * 3, color)
            ctx.globalAlpha = 1
          })
        }
        dot(X(last.t), Y(last.y), 4, color)
      }

      // selection
      const hv = this._hover
      if (hv) {
        ctx.setLineDash([3, 3])
        ctx.lineWidth = 1
        ctx.strokeStyle = C.label3
        ctx.beginPath(); ctx.moveTo(hv.x, P.t); ctx.lineTo(hv.x, H - P.b); ctx.stroke()
        if (multi) {
          ctx.setLineDash([])
          series.forEach(s => (s.points || []).forEach(p => {
            if (p.t === hv.t) dot(X(p.t), Y(p.y), 4.5, resolveColor(s.color, C, color), C.bg)
          }))
        } else {
          ctx.beginPath(); ctx.moveTo(P.l, hv.y); ctx.lineTo(W - P.r, hv.y); ctx.stroke()
          ctx.setLineDash([])
          dot(hv.x, hv.y, 5, color, C.bg)
        }
        ctx.setLineDash([])
      }
    },

    onTouch(e) {
      const g = this._geo
      if (!g || !g.hoverPts.length) return
      const tch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])
      if (!tch) return
      // canvas touches carry x relative to the canvas; fall back to the page coordinate
      let x = tch.x
      if (x == null) {
        x = tch.clientX
        if (this._left == null) {
          this.createSelectorQuery().select('#lc').boundingClientRect(r => { this._left = r ? r.left : 0 }).exec()
          return
        }
        x -= this._left
      }
      let best = g.hoverPts[0]
      g.hoverPts.forEach(p => { if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p })
      if (this._hover && this._hover.i === best.i) return
      this._hover = best
      this.paint()
      this.showTip(best)
      this.triggerEvent('select', { index: best.i, t: best.t, iso: best.iso, v: best.v, note: best.note || '' })
    },

    showTip(p) {
      const g = this._geo
      const unit = this.data.unit
      const date = fmtDay(p.iso, g.showYear)
      const text = g.multi
        ? date + (p.note ? ' · ' + p.note : '')
        : date + ' · ' + num(p.v) + (unit ? ' ' + unit : '') + (p.note ? ' · ' + p.note : '')
      // First laid out invisibly to measure, then placed inside the box (LineChart.jsx's rule:
      // centred on the point, clamped to the edges, dropped below a point that sits high).
      this.setData({ tipText: text, tipStyle: 'visibility:hidden;left:0;top:0' }, () => {
        this.createSelectorQuery().select('.ctip').boundingClientRect(r => {
          if (!r || this._hover !== p) return
          const M = 4, cw = g.W, ch = g.H, tw = r.width, th = r.height
          const left = Math.max(M, Math.min(cw - tw - M, p.x - tw / 2))
          const top = p.y < th + 14 ? Math.min(ch - th - M, p.y + 14) : M
          this.setData({ tipStyle: 'left:' + left.toFixed(1) + 'px;top:' + top.toFixed(1) + 'px' })
        }).exec()
      })
    },
  },
}))
