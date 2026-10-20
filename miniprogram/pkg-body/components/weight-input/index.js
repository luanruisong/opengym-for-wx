// <weight-input value="{{v}}" unit="kg" bind:change="onV" />  — frontend/src/sheets.jsx
// WeightInput: ± 0.1 buttons around the big typed read-out, −1/−0.5/+0.5/+1 chips and a slider
// (W_LO…wHi(unit), step 0.5). A typed value is reported as typed (it may sit past the slider);
// the buttons, chips and slider clamp to the slider's range and round to 0.1.
//
// properties  value Number, unit String
// events      change { value }
import { connectComponent } from '../../../utils/page.js'
import { themeColors } from '../../../utils/theme.js'
import { W_LO, wHi } from '../../_shared.js'

const round1 = x => Math.round((x || 0) * 10) / 10

Component(connectComponent({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    value: { type: Number, value: 70 },
    unit: { type: String, value: 'kg' },
  },
  data: { lo: W_LO, hi: 300, sv: 70, acc: '#30d158', track: '#3a3a3c', knob: '#ffffff' },
  mapState(S) {
    const c = themeColors(S)
    return { acc: c.acc, track: c.surface3 || c.surface2 || '#3a3a3c' }
  },
  observers: {
    'value, unit'(value, unit) {
      const hi = wHi(unit)
      this.setData({ hi, sv: Math.max(W_LO, Math.min(hi, value || 0)) })
    },
  },
  methods: {
    clamp(x) { return Math.max(W_LO, Math.min(wHi(this.properties.unit), round1(x))) },
    slide(v) { this.triggerEvent('change', { value: this.clamp(v) }) },
    onStep(e) { this.slide((this.properties.value || 0) + Number(e.currentTarget.dataset.d)) },
    onType(e) { this.triggerEvent('change', { value: e.detail.value }) },
    onSlider(e) { this.slide(e.detail.value) },
  },
}))
