// <duration-wheel value="{{sec}}" min="0" max="900" bind:change="onSec" />
// Minutes and seconds wheels for a duration in seconds (components/DurationWheel.jsx), drawn with
// the native picker-view. Every value the wheels come to rest on is clamped to [min, max]; a
// clamped pick snaps the wheels back to what was kept. Rows outside the range are dimmed.
//
// properties
//   value  Number  seconds
//   min    Number  0
//   max    Number  900 (REST_MAX, 15 minutes)
// events
//   change     detail { value }   the clamped seconds, when it differs from `value`
//   pickstart  detail {}          a wheel started rolling (a Done should wait: picker-view only
//   pickend    detail {}          reports where it settled)
//
// durationSheet(opts) in ./sheet.js opens the wheel on a page of its own (pkg-common/duration).
import { REST_MAX, clampDuration, splitDuration, joinDuration } from '../../../lib/duration.js'

const pad2 = n => (n < 10 ? '0' : '') + n

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    value: { type: Number, value: 0 },
    min: { type: Number, value: 0 },
    max: { type: Number, value: REST_MAX },
  },
  data: { mins: [], secs: [], idx: [0, 0] },
  observers: {
    'value, min, max'(value, min, max) { this._build(value, min, max) },
  },
  lifetimes: {
    attached() { const p = this.properties; this._build(p.value, p.min, p.max) },
  },
  methods: {
    _build(value, min, max) {
      const v = clampDuration(value, min, max)
      const { m, s } = splitDuration(v)
      const maxM = Math.floor(max / 60)
      const mins = []
      for (let i = 0; i <= maxM; i++) mins.push({ k: i, t: String(i), out: i * 60 > max || (i + 1) * 60 - 1 < min })
      const secs = []
      for (let i = 0; i < 60; i++) secs.push({ k: i, t: pad2(i), out: m * 60 + i > max || m * 60 + i < min })
      this._v = v
      this.setData({ mins, secs, idx: [m, s] })
    },
    onChange(e) {
      const [mm, ss] = e.detail.value
      const p = this.properties
      const next = joinDuration(mm, ss, p.min, p.max)
      const { m, s } = splitDuration(next)
      // back to what was kept, if it was clamped; redraw the seconds' dimming for the new minute
      this._build(next, p.min, p.max)
      if (m !== mm || s !== ss) this.setData({ idx: [m, s] })
      if (next !== p.value) this.triggerEvent('change', { value: next })
    },
    onStart() { this.triggerEvent('pickstart', {}) },
    onEnd() { this.triggerEvent('pickend', {}) },
  },
})
