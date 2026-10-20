// <icon-x name="flame" />  — the openGym icon set (ported from frontend/src/components/Icon.jsx,
// same names; an unknown name renders nothing, like the original's `return null`).
//
// properties
//   name    String  icon name (icons.js keys: house, calendar, chart, dumbbell, play, …)
//   size    String|Number  edge length; default '1em' (follows the surrounding font-size, like
//                   the original .icn). A bare number or numeric string gets 'px'.
//   color   String  '' (default) = follow the parent's text colour (currentColor), exactly like
//                   the original. Otherwise any CSS colour, CSS variables included ('var(--acc)').
//   stroke  Number  stroke width on the 24×24 grid, default 1.7 (the original --icon-stroke).
//   cls     String  extra class names for the icon's box.
// events: none (put bindtap on a parent).
//
// How it is drawn: a mini program has no inline <svg>, and an <image> of an SVG cannot take
// currentColor. So the icon is a <view> whose background is the colour and whose CSS mask is the
// SVG (data URI): the strokes let the background through, the rest is transparent. That keeps
// icons theme-coloured with no colour plumbing — set `color` on the parent, as on the web.
// The component is a virtual host, so it sits directly in its parent's flex layout.
import ICONS from './icons.js'

const cache = {}
function maskUrl(name, stroke) {
  const key = name + '|' + stroke
  if (cache[key]) return cache[key]
  const inner = ICONS[name]
  if (!inner) return ''
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#000' stroke-width='" +
    stroke + "' stroke-linecap='round' stroke-linejoin='round'>" + inner.replace(/"/g, "'") + '</svg>'
  const enc = svg.replace(/%/g, '%25').replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E')
  cache[key] = 'url("data:image/svg+xml,' + enc + '")'
  return cache[key]
}

function sizeOf(v) {
  if (v === '' || v == null) return '1em'
  const s = String(v)
  return /^\d+(\.\d+)?$/.test(s) ? s + 'px' : s
}

Component({
  options: { styleIsolation: 'apply-shared', virtualHost: true },
  properties: {
    name: { type: String, value: '' },
    size: { type: null, value: '1em' },
    color: { type: String, value: '' },
    stroke: { type: Number, value: 1.7 },
    cls: { type: String, value: '' },
  },
  data: { st: '', ok: false },
  lifetimes: {
    attached() { const p = this.properties; this._draw(p.name, p.size, p.color, p.stroke) },
  },
  observers: {
    'name, size, color, stroke'(name, size, color, stroke) { this._draw(name, size, color, stroke) },
  },
  methods: {
    _draw(name, size, color, stroke) {
      const url = maskUrl(name, stroke || 1.7)
      if (!url) { this.setData({ ok: false, st: '' }); return }
      const sz = sizeOf(size)
      const st = 'width:' + sz + ';height:' + sz +
        ';-webkit-mask-image:' + url + ';mask-image:' + url +
        ';-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat' +
        ';background-color:' + (color || 'currentColor')
      if (st !== this.data.st || !this.data.ok) this.setData({ ok: true, st })
    },
  },
})
