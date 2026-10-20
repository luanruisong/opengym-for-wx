// <stepper value="{{reps}}" step="1" min="0" label="次数" unit="kg" bind:change="onReps" />
// (ui.jsx Stepper): − [number] +, holding a button repeats the step (faster after a while).
//
// properties
//   value     Number|null
//   step      Number   1
//   min       Number   0      the buttons clamp at once; typing is clamped when the field is left
//   max       Number   1e9
//   decimal   Boolean  true   decimals allowed in the field
//   nullable  Boolean  false  an emptied field reports null
//   label     String   ''     a caption over the control (.stp-w / .stp-l)
//   unit      String   ''     small unit after the number
//   invalid   Boolean  false  red ring
//   disabled  Boolean  false
//   plain     Boolean  false  no ± buttons (Workout controls → steppers off)
//   cls       String   ''     extra classes on .stp (e.g. "w", "r", "mini")
//   placeholder String
// events
//   change  detail { value: number|null, dir?: -1|1 }   dir is set for a button step
//   step    detail { value, step, dir }   fired instead of `change` when `custom-step` is true,
//           so the page can apply its own stepping rule (the original's onStep)
//   customStep Boolean false (property)
const round2 = v => Math.round((v || 0) * 100) / 100

Component({
  options: { styleIsolation: 'apply-shared', virtualHost: true },
  properties: {
    value: { type: null, value: null },
    step: { type: Number, value: 1 },
    min: { type: Number, value: 0 },
    max: { type: Number, value: 1e9 },
    decimal: { type: Boolean, value: true },
    nullable: { type: Boolean, value: false },
    label: { type: String, value: '' },
    unit: { type: String, value: '' },
    invalid: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false },
    plain: { type: Boolean, value: false },
    cls: { type: String, value: '' },
    placeholder: { type: String, value: '' },
    customStep: { type: Boolean, value: false },
  },
  lifetimes: {
    detached() { this._stopHold() },
  },
  observers: {
    value(v) { if (!this._holding) this._live = v },
  },
  methods: {
    _clamp(v) {
      const p = this.properties
      return Math.min(p.max, Math.max(p.min, v))
    },
    _bump(dir) {
      const p = this.properties
      const cur = this._live !== undefined ? this._live : p.value
      if (p.customStep) { this.triggerEvent('step', { value: cur, step: p.step, dir }); return }
      const next = this._clamp(round2((+cur || 0) + dir * p.step))
      this._live = next
      if (next !== cur) this.triggerEvent('change', { value: next, dir })
    },
    _startHold(dir) {
      this._stopHold()
      this._repeated = false
      this._count = 0
      this._delay = setTimeout(() => {
        this._holding = true
        const run = () => {
          this._repeated = true
          this._count++
          this._bump(dir)
          if (this._count === 15) { clearInterval(this._tick); this._tick = setInterval(run, 40) }
        }
        this._tick = setInterval(run, 80)
      }, 400)
    },
    _stopHold() {
      clearTimeout(this._delay); clearInterval(this._tick)
      this._delay = this._tick = null
      this._holding = false
    },
    onDownStart() { if (!this.properties.disabled) this._startHold(-1) },
    onUpStart() { if (!this.properties.disabled) this._startHold(1) },
    onEnd() { this._stopHold() },
    onDec() { if (this._repeated) { this._repeated = false; return } this._live = this.properties.value; this._bump(-1) },
    onInc() { if (this._repeated) { this._repeated = false; return } this._live = this.properties.value; this._bump(1) },
    onField(e) {
      this._live = e.detail.value
      this.triggerEvent('change', { value: e.detail.value })
    },
    onBlur() {
      const v = this.properties.value
      if (v == null) return
      const c = this._clamp(+v || 0)
      if (c !== v) { this._live = c; this.triggerEvent('change', { value: c }) }
    },
  },
})
