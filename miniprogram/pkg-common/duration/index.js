// The duration wheel as a sheet (frontend/src/components/DurationWheel.jsx DurationSheet), opened
// by utils/duration-sheet.js#durationSheet. params: { title, value, min, max, off,
// footer, onDone }. Nothing is saved until 完成: onDone(sec) runs with the clamped value, then back.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage } from '../../utils/nav.js'
import { REST_MAX, clampDuration, fmtDuration } from '../../lib/duration.js'

Page(connectPage({
  data: { v: 0, min: 0, max: REST_MAX, read: '', footer: '' },
  onLoad(query) {
    const p = pageParams(query)
    this.params = p
    const min = p.min != null ? p.min : 0
    const max = p.max != null ? p.max : REST_MAX
    const v = clampDuration(p.value, min, max)
    this.setData({ v, min, max, footer: p.footer ? String(p.footer) : '', read: this.fmt(v) })
    if (p.title) wx.setNavigationBarTitle({ title: String(p.title) })
  },
  onUnload() { releasePage(this.query) },
  fmt(v) { return fmtDuration(v, { off: this.params && this.params.off != null ? this.params.off : null }) },
  onChange(e) {
    const v = e.detail.value
    this.setData({ v, read: this.fmt(v) })
  },
  // picker-view reports only where a wheel settled: a Done tapped mid-roll waits for it (at most
  // half a second, in case a pickend never comes) so it does not save the value from before.
  onPickStart() { this.picking = true },
  onPickEnd() {
    this.picking = false
    if (this.pending) setTimeout(() => this.finish(), 100)
  },
  onDone() {
    if (this.done) return
    if (this.picking) {
      this.pending = true
      setTimeout(() => this.finish(), 500)
      return
    }
    this.finish()
  },
  finish() {
    if (this.done) return
    this.done = true
    const v = this.data.v
    const cb = this.params && this.params.onDone
    wx.navigateBack({
      success: () => { if (typeof cb === 'function') setTimeout(() => cb(v), 0) },
      fail: () => { if (typeof cb === 'function') cb(v) },
    })
  },
}))
