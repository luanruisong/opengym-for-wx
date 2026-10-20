// <body-map load="{{load}}" body="male" selected="{{sel}}" tappable bind:pick="onMuscle" />
// Front and back views of a body, each muscle shaded by how hard it was worked (port of
// frontend/src/components/BodyMap.jsx + the .bodymap/.bm-* rules in index.css).
//
// properties
//   load        Object   effective sets (or any score) per muscle slug, { chest: 12, … }
//   thresholds  Array    optional ordered [{ at, level, exclusive? }] for a fixed absolute scale
//                        (recovery views); omitted = shading relative to the hardest-worked muscle
//                        (lib/muscles.js levelsOf)
//   body        String   'male' (default) | 'female' — S.body
//   selected    String   muscle slug drawn with an outline ('' = none)
//   tappable    Boolean  muscles answer taps (bind:pick); the original's onMuscle
//   variant     String   '' (accent ramp) | 'fatigue' (yellow→orange→red, was .hm-fatigue) |
//                        'strength' (top band gold, was .hm-strength)
//   legend      Boolean  draw the 更少 ▢▢▢▢▢ 更多 legend under the map (BodyMapLegend)
//   cls         String   extra classes for the root
// events
//   pick        detail { part }  — the tapped muscle's slug (only muscles, never head/hands…;
//                        only when `tappable`). Toggling the selection is the page's job.
//
// Drawn on two canvas 2D nodes (front, back). Colours come from utils/theme.js themeColors(S)
// (canvas cannot read CSS variables) — the CSS color-mix() shades are computed here.
// Geometry is parsed once per (body, view) and kept at module level (paths.js).
import { bodyPaths } from '../../lib/body-data.js'
import { MUSCLES, INERT, levelsOf } from '../../lib/muscles.js'
import { connectComponent } from '../../utils/page.js'
import { themeColors } from '../../utils/theme.js'
import { parsePath, flatten, hit, trace } from './paths.js'

const GEO = {}
function geometry(body, view) {
  const key = body + '/' + view
  if (GEO[key]) return GEO[key]
  // Outlines arrive with the data subpackage at launch (lib/boot-data.js); before that, or after a
  // failed load, an empty (uncached) geometry draws nothing instead of throwing.
  const BODY = bodyPaths()
  if (!BODY) return { vb: [0, 0, 100, 200], parts: [] }
  const g = (BODY[body] || BODY.male)[view]
  const vb = g.vb.split(/[\s,]+/).map(Number)
  const parts = []
  const add = (slug, inert) => (g.p[slug] || []).forEach(d => {
    const cmds = parsePath(d)
    parts.push({ slug, inert, cmds, polys: inert ? null : flatten(cmds) })
  })
  INERT.forEach(s => add(s, true))
  MUSCLES.forEach(s => add(s, false))
  return (GEO[key] = { vb, parts })
}

// --- colour maths: CSS color-mix(in srgb, a p%, b) on '#rgb' / '#rrggbb' / 'rgb[a](…)' ---
function parse(c) {
  c = String(c || '').trim()
  let m = c.match(/^#([0-9a-f]{3})$/i)
  if (m) return [...m[1]].map(h => parseInt(h + h, 16)).concat(1)
  m = c.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i)
  if (m) {
    const n = parseInt(m[1], 16)
    return [n >> 16, (n >> 8) & 255, n & 255, m[2] ? parseInt(m[2], 16) / 255 : 1]
  }
  m = c.match(/^rgba?\(([^)]+)\)$/i)
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    return [p[0] || 0, p[1] || 0, p[2] || 0, p[3] == null ? 1 : p[3]]
  }
  return [128, 128, 128, 1]
}
function mix(a, b, p) {
  const x = parse(a), y = parse(b)
  // premultiplied, like color-mix
  const al = x[3] * p + y[3] * (1 - p)
  const ch = i => al ? (x[i] * x[3] * p + y[i] * y[3] * (1 - p)) / al : 0
  return 'rgba(' + Math.round(ch(0)) + ',' + Math.round(ch(1)) + ',' + Math.round(ch(2)) + ',' + +al.toFixed(3) + ')'
}

function palette(C, variant) {
  const base = mix(C.label, C.surface, 0.11)
  const lv = [base, mix(C.acc, base, 0.32), mix(C.acc, base, 0.56), mix(C.acc, base, 0.78), C.acc]
  if (variant === 'fatigue') { lv[1] = mix(C.yellow, base, 0.32); lv[2] = C.yellow; lv[3] = C.orange; lv[4] = C.red }
  if (variant === 'strength') lv[4] = C.yellow
  return { sil: mix(C.label, C.surface, 0.18), lv, edge: C.surface, sel: C.label, glow: variant === 'strength' ? C.yellow : '' }
}

const GAP = 6
const VIEWS = ['front', 'back']

Component(connectComponent({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    load: { type: Object, value: {} },
    thresholds: { type: null, value: null },
    body: { type: String, value: 'male' },
    selected: { type: String, value: '' },
    tappable: { type: Boolean, value: false },
    variant: { type: String, value: '' },
    legend: { type: Boolean, value: false },
    cls: { type: String, value: '' },
  },
  data: { colors: null, sizes: null, legendCls: ['l0', 'l1', 'l2', 'l3', 'l4'] },
  mapState(S) {
    return { colors: themeColors(S) }
  },
  observers: {
    'colors, load, thresholds, selected, variant'() { this._schedule() },
    body() { this._layout() },
  },
  lifetimes: {
    attached() { this._alive = true; this._layout() },
    detached() { this._alive = false; clearTimeout(this._t) },
  },
  pageLifetimes: {
    resize() { this._layout() },
  },
  methods: {
    // Sizes both canvases from the root's width, keeping the viewBox ratio and the original's
    // max-height of min(46vh, 340px).
    _layout() {
      if (!this._alive) return
      wx.createSelectorQuery().in(this).select('.bodymap').boundingClientRect(r => {
        if (!this._alive || !r || !r.width) return
        let winH = 700
        try { winH = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).windowHeight } catch (e) { /* default */ }
        const maxH = Math.min(winH * 0.46, 340)
        const w0 = (r.width - GAP) / 2
        const sizes = VIEWS.map(v => {
          const vb = geometry(this.data.body, v).vb
          let w = w0, h = w0 * vb[3] / vb[2]
          if (h > maxH) { h = maxH; w = h * vb[2] / vb[3] }
          return { w: Math.floor(w), h: Math.floor(h) }
        })
        this._nodes = null
        this.setData({ sizes }, () => this._schedule())
      }).exec()
    },
    _schedule() {
      clearTimeout(this._t)
      this._t = setTimeout(() => this._draw(), 16)
    },
    _withNodes(cb) {
      if (this._nodes) { cb(this._nodes); return }
      wx.createSelectorQuery().in(this).selectAll('.bm-c').fields({ node: true, size: true }).exec(res => {
        const list = res && res[0]
        if (!list || list.length < 2 || !list[0].node) return
        this._nodes = list
        cb(list)
      })
    },
    _draw() {
      if (!this._alive || !this.data.sizes || !this.data.colors) return
      this._withNodes(nodes => {
        let dpr = 2
        try { dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2 } catch (e) { /* default */ }
        const P = palette(this.data.colors, this.data.variant)
        const levels = levelsOf(this.data.load || {}, this.data.thresholds || undefined)
        const selected = this.data.selected
        VIEWS.forEach((v, i) => {
          const n = nodes[i], canvas = n.node, sz = this.data.sizes[i]
          const geo = geometry(this.data.body, v)
          const [vx, vy, vw] = geo.vb
          canvas.width = Math.round(sz.w * dpr)
          canvas.height = Math.round(sz.h * dpr)
          const ctx = canvas.getContext('2d')
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          const k = canvas.width / vw
          ctx.setTransform(k, 0, 0, k, -vx * k, -vy * k)
          ctx.lineJoin = 'round'
          let sel = null
          for (const p of geo.parts) {
            ctx.beginPath()
            trace(ctx, p.cmds)
            const lv = p.inert ? -1 : (levels[p.slug] || 0)
            ctx.fillStyle = p.inert ? P.sil : P.lv[lv]
            if (lv === 4 && P.glow) { ctx.shadowColor = P.glow; ctx.shadowBlur = 3 * dpr } else { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent' }
            ctx.fill()
            ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'
            ctx.strokeStyle = P.edge
            ctx.lineWidth = 2.5
            ctx.stroke()
            if (!p.inert && selected && p.slug === selected) (sel = sel || []).push(p)
          }
          // the selected muscle's outline on top, so neighbours do not paint over it
          if (sel) sel.forEach(p => {
            ctx.beginPath(); trace(ctx, p.cmds)
            ctx.strokeStyle = P.sel; ctx.lineWidth = 7; ctx.stroke()
          })
        })
      })
    },
    onTap(e) {
      if (!this.properties.tappable) return
      const i = Number(e.currentTarget.dataset.i)
      const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0])
      const cx = t ? (t.clientX != null ? t.clientX : t.x) : null
      const cy = t ? (t.clientY != null ? t.clientY : t.y) : null
      wx.createSelectorQuery().in(this).selectAll('.bm-c').boundingClientRect(rs => {
        const r = rs && rs[i]
        if (!r || cx == null) return
        const geo = geometry(this.data.body, VIEWS[i])
        const [vx, vy, vw, vh] = geo.vb
        const px = vx + (cx - r.left) * vw / r.width
        const py = vy + (cy - r.top) * vh / r.height
        // topmost first: muscles are drawn after the silhouette, in MUSCLES order
        for (let j = geo.parts.length - 1; j >= 0; j--) {
          const p = geo.parts[j]
          if (p.inert) continue
          if (hit(p.polys, px, py)) { this.triggerEvent('pick', { part: p.slug }); return }
        }
      }).exec()
    },
  },
}))
