// <num-field value="{{w}}" decimal nullable bind:change="onW" />  (ui.jsx NumberField)
//
// A numeric input that takes "," as the decimal separator (many iOS decimal keypads offer only
// a comma) and keeps the text as typed while focused, so "33," or "8." survive a keystroke.
//
// properties
//   value        Number|null  the committed number (null/undefined shows an empty field)
//   decimal      Boolean  true  decimals allowed (digit keypad); false = whole numbers (a typed
//                               separator stays on screen until blur but only the part before it counts)
//   nullable     Boolean  false an emptied field reports null instead of 0 (RIR: 0 is a real value)
//   placeholder  String
//   disabled     Boolean
//   focus        Boolean  give it focus
//   selectOnFocus Boolean true  focus "selects" the number: the field shows empty with the current
//                               value as placeholder, so typing replaces it; leaving without typing
//                               restores it (the mini program input has no select()).
//   cls          String   extra classes on the <input> (default class "num")
//   fit          Boolean  width follows the digits (the big weight read-out)
// events
//   change  detail { value: number|null }  on every keystroke that changes the number
//   focus / blur  detail {}
function clean(raw, decimal, nullable) {
  let s = String(raw == null ? '' : raw).replace(/,/g, '.').replace(/[^0-9.]/g, '')
  const i = s.indexOf('.')
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '')
  const whole = !decimal && i !== -1 ? s.slice(0, i) : s
  const n = whole === '' || whole === '.' ? (nullable ? null : 0) : Math.max(0, parseFloat(whole))
  return { s, n }
}
const show = v => (v === null || v === undefined || Number.isNaN(v) ? '' : String(v))
const widthCh = s => Math.max(1, s.split('').reduce((n, c) => n + (c === '.' ? 0.5 : 1), 0))

Component({
  options: { styleIsolation: 'apply-shared', virtualHost: true },
  properties: {
    value: { type: null, value: null },
    decimal: { type: Boolean, value: true },
    nullable: { type: Boolean, value: false },
    placeholder: { type: String, value: '' },
    disabled: { type: Boolean, value: false },
    focus: { type: Boolean, value: false },
    selectOnFocus: { type: Boolean, value: true },
    cls: { type: String, value: '' },
    fit: { type: Boolean, value: false },
  },
  data: { shown: '', ph: '', st: '' },
  lifetimes: {
    attached() { this._sync() },
  },
  observers: {
    value() {
      // A value from outside that is not the one this field just reported drops the draft.
      if (this._focused && this._committed !== undefined && sameNum(this._committed, this.properties.value)) return
      this._draft = null
      this._sync()
    },
    'placeholder, fit'() { this._sync() },
  },
  methods: {
    _sync() {
      const p = this.properties
      const shown = this._draft != null ? this._draft : show(p.value)
      const ph = this._focused && this._draft === '' && this._held != null ? this._held : p.placeholder
      const st = p.fit ? 'width:' + widthCh(shown || ph || '0') + 'ch;' : ''
      if (shown !== this.data.shown || ph !== this.data.ph || st !== this.data.st) this.setData({ shown, ph, st })
    },
    onFocus() {
      this._focused = true
      this._committed = undefined
      const cur = show(this.properties.value)
      if (this.properties.selectOnFocus && cur !== '') { this._held = cur; this._draft = '' } else { this._held = null }
      this._sync()
      this.triggerEvent('focus', {})
    },
    onInput(e) {
      const p = this.properties
      const { s, n } = clean(e.detail.value, p.decimal, p.nullable)
      this._draft = s
      this._held = null
      this._committed = n
      this.setData({ shown: s, ph: p.placeholder })
      if (!sameNum(n, p.value)) this.triggerEvent('change', { value: n })
      return s
    },
    onBlur() {
      this._focused = false
      this._draft = null
      this._held = null
      this._committed = undefined
      this._sync()
      this.triggerEvent('blur', {})
    },
  },
})

function sameNum(a, b) {
  const na = a === undefined ? null : a, nb = b === undefined ? null : b
  return na === nb
}
