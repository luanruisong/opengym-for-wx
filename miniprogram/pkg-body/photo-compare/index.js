// The before/after slider between two progress photos (frontend/src/views/ProgressPhotos.jsx
// ProgressCompare). params: { a, b } — { d, m: MediaRef }, a the earlier. The later photo fills
// the stage; the earlier one is drawn over it, cut off at the handle, which a finger drags.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage } from '../../utils/nav.js'
import { fmtDate } from '../../lib/format.js'
import { t, tn } from '../../lib/i18n.js'
import { mediaStore } from '../../lib/media-store.js'
import { daysBetween } from '../progress-photos/photos.js'

Page(connectPage({
  data: { before: '', after: '', pct: 50, w: 0, da: '', db: '' },
  onLoad(query) {
    const p = pageParams(query)
    const a = p.a, b = p.b
    if (!a || !b) { wx.navigateBack(); return }
    const days = daysBetween(a.d, b.d)
    wx.setNavigationBarTitle({ title: days > 0 ? tn('{0} day apart', '{0} days apart', days) : t('Same day') })
    this.setData({ da: fmtDate(a.d, true), db: fmtDate(b.d, true) })
    Promise.all([mediaStore.url(a.m.hash), mediaStore.url(b.m.hash)])
      .then(([before, after]) => this.setData({ before: before || '', after: after || '' }))
      .catch(() => {})
    this.hashes = [a.m.hash, b.m.hash]
  },
  onReady() {
    wx.createSelectorQuery().select('#stage').boundingClientRect(r => {
      if (r) { this.rect = r; this.setData({ w: r.width }) }
    }).exec()
  },
  onUnload() {
    for (const h of this.hashes || []) { try { mediaStore.release(h) } catch (e) { /* nothing to revoke */ } }
    releasePage(this.query)
  },
  onTouch(e) {
    const r = this.rect
    const tt = e.touches && e.touches[0]
    if (!r || !r.width || !tt) return
    const pct = Math.max(0, Math.min(100, ((tt.clientX - r.left) / r.width) * 100))
    this.setData({ pct })
  },
}))
