// <seg options="{{opts}}" value="{{v}}" bind:change="onV" />  (ui.jsx Segmented)
// The selected pill slides between equal cells.
//
// properties
//   options  Array   [{ value, label, icon? }]   value may be a string, number or boolean
//   value    any     the selected value
//   inline   Boolean false  sized to its labels, for a list row (.seg-inline)
//   cls      String  extra classes on .seg (e.g. "seg-range")
// events
//   change   detail { value }   only when another option is tapped
Component({
  options: { styleIsolation: 'apply-shared', virtualHost: true },
  properties: {
    options: { type: Array, value: [] },
    value: { type: null, value: null },
    inline: { type: Boolean, value: false },
    cls: { type: String, value: '' },
  },
  data: { items: [], selStyle: '' },
  observers: {
    'options, value'(options, value) {
      const opts = options || []
      const n = Math.max(1, opts.length)
      const i = Math.max(0, opts.findIndex(o => o.value === value))
      this.setData({
        items: opts.map((o, k) => ({ k, label: o.label == null ? '' : String(o.label), icon: o.icon || '', on: k === i })),
        selStyle: 'width:calc((100% - 4px) / ' + n + ');transform:translateX(' + (i * 100) + '%);',
      })
    },
  },
  methods: {
    onTap(e) {
      const k = +e.currentTarget.dataset.k
      const o = (this.properties.options || [])[k]
      if (!o || o.value === this.properties.value) return
      this.triggerEvent('change', { value: o.value })
    },
  },
})
