// <sheet show="{{open}}" title="选择" bind:close="onClose"> …content… </sheet>
// An in-page bottom sheet (the web app's .sheet over #modal-root): a dimmed backdrop and a panel
// that slides up, with the grab bar and an optional title. For small one-off choices on a page;
// a full "sheet" of the original app is a page of its own (utils/sheets.js).
//
// properties
//   show     Boolean false  open / closed (the page owns it; set it false in bind:close)
//   title    String  ''     the sheet title (.h3)
//   locked   Boolean false  the backdrop does not close it (a sheet with unsaved input)
//   maxH     String  '86vh' panel's max height; the content scrolls inside
//   center   Boolean false  a centred dialog instead of a bottom sheet (.center)
// events
//   close    detail {}      backdrop tapped (unless locked); the page sets show=false
//   (default slot) the content
Component({
  options: { styleIsolation: 'apply-shared', multipleSlots: true },
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
    locked: { type: Boolean, value: false },
    maxH: { type: String, value: '86vh' },
    center: { type: Boolean, value: false },
  },
  data: { mounted: false, open: false },
  observers: {
    show(v) {
      clearTimeout(this._t)
      if (v) {
        this.setData({ mounted: true })
        this._t = setTimeout(() => this.setData({ open: true }), 20)
      } else if (this.data.mounted) {
        this.setData({ open: false })
        this._t = setTimeout(() => this.setData({ mounted: false }), 300)
      }
    },
  },
  lifetimes: {
    detached() { clearTimeout(this._t) },
  },
  methods: {
    onMask() { if (!this.properties.locked) this.triggerEvent('close', {}) },
    noop() {},
  },
})
