// <bar-chart> — the horizontal bar rows of the Stats page (index.css .mrow: name · bar · value).
// The web app has no canvas bar chart: muscle balance, weekly muscle volume, RIR histogram,
// strength by muscle and the 1RM decay list are all `.mrow` rows of <span>s, so this is plain
// views too.
//
// properties
//   rows      Array  [{ key, label, bold?, tag?, labelSub?, pct: 0..100, color?, value, valueDim?, sub? }]
//                    label     name on the left (bold → <b>)
//                    tag       small dim word after the name ('主要' / '次要')
//                    labelSub  second small dim line under the name (two-line rows, e.g. 1RM)
//                    pct       bar fill in percent (clamped 0–100)
//                    color     fill: theme token ('yellow', 'label-3'), 'var(--yellow)' or a CSS
//                              colour; default the accent
//                    value     text on the right; valueDim is a dim suffix on the same line
//                              (' · 80%'), sub a small dim line under it
//   tappable  Boolean rows respond to taps (default false)
//   barWidth  Number  bar width in px (default 74, as index.css)
//
// events
//   bind:rowtap  { key, index }   only when tappable (not 'tap': the native tap bubbles out too)
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    rows: { type: Array, value: [] },
    tappable: { type: Boolean, value: false },
    barWidth: { type: Number, value: 74 },
  },
  data: { list: [] },
  observers: {
    rows(rows) {
      const list = (rows || []).map((r, i) => {
        const pct = Math.max(0, Math.min(100, Number(r.pct) || 0))
        return {
          k: r.key != null ? String(r.key) : String(i),
          label: r.label == null ? '' : String(r.label),
          bold: !!r.bold,
          tag: r.tag || '',
          labelSub: r.labelSub || '',
          fill: 'width:' + Math.round(pct * 10) / 10 + '%' + (r.color ? ';background:' + cssColor(r.color) : ''),
          value: r.value == null ? '' : String(r.value),
          valueDim: r.valueDim || '',
          sub: r.sub || '',
        }
      })
      this.setData({ list })
    },
  },
  methods: {
    onTap(e) {
      if (!this.data.tappable) return
      const index = +e.currentTarget.dataset.i
      const row = (this.data.rows || [])[index]
      this.triggerEvent('rowtap', { key: row && row.key != null ? row.key : index, index })
    },
  },
})

function cssColor(c) {
  const s = String(c).trim()
  if (/^var\(/.test(s) || s[0] === '#' || /^(rgb|hsl)a?\(/i.test(s)) return s
  if (/^[a-z][\w-]*$/i.test(s)) {
    // camelCase token names (label3) → kebab (label-3)
    const k = s.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase()
    return 'var(--' + k + ')'
  }
  return s
}
