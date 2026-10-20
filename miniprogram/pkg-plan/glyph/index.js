// The routine icon picker (frontend/src/sheets.jsx glyphPicker): four short rows of glyphs grouped
// by what they mean for a training day. params: { current, onPick(name) }.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage } from '../../utils/nav.js'
import { GLYPH_GROUPS, glyphOf } from '../../lib/glyphs.js'
import { t } from '../../lib/i18n.js'

Page(connectPage({
  data: { groups: [] },
  onLoad(query) {
    this.params = pageParams(query)
    const cur = glyphOf(this.params.current)
    this.setData({
      groups: GLYPH_GROUPS.map(g => ({
        key: g.key,
        title: t(g.key),
        items: g.items.map(n => ({ n, on: n === cur })),
      })),
    })
  },
  onUnload() {
    releasePage(this.query)
  },
  onPick(e) {
    if (this.done) return
    this.done = true
    const n = e.currentTarget.dataset.n
    const f = this.params && this.params.onPick
    if (typeof f === 'function') { try { f(n) } catch (err) { console.error(err) } }
    wx.navigateBack()
  },
}))
