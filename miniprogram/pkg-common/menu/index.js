// The themed menu (frontend/src/sheets.jsx MenuSheet), for the menus utils/sheets.js#menuSheet does
// not hand to wx.showActionSheet: grouped sections, subtitles, check marks, disabled rows.
//
// params (pageParams):  { title, subtitle, grouped?, sections: [{ title, items: [{ label, sub, icon,
//   danger, disabled, on, chevron, accent, onClick }] }] }
// `grouped` (sections given by the caller) draws the groups as inset lists with headers; when the
// opener does not say, more than one group or a titled group counts as grouped.
// A tap goes back first and runs onClick once the menu page is gone, so an onClick that opens
// another page (or toasts) does so from the page that opened the menu.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage } from '../../utils/nav.js'

Page(connectPage({
  data: { subtitle: '', groups: [], grouped: false },
  onLoad(query) {
    const p = pageParams(query)
    this.params = p
    const groups = (p.sections || [{ items: p.items }])
      .map(g => ({ title: g && g.title ? String(g.title) : '', items: ((g && g.items) || []).filter(Boolean) }))
      .filter(g => g.items.length)
    this.groupsRaw = groups
    const grouped = p.grouped != null ? !!p.grouped : groups.length > 1 || groups.some(g => g.title)
    this.setData({
      subtitle: p.subtitle ? String(p.subtitle) : '',
      grouped,
      groups: groups.map((g, gi) => ({
        gi,
        title: g.title,
        items: g.items.map((it, ii) => ({
          ii,
          label: it.label == null ? '' : String(it.label),
          sub: it.sub ? String(it.sub) : '',
          icon: it.icon || '',
          danger: !!it.danger,
          disabled: !!it.disabled,
          hasOn: it.on != null,
          on: !!it.on,
          chevron: !!it.chevron,
          accent: !!it.accent,
        })),
      })),
    })
    if (p.title) wx.setNavigationBarTitle({ title: String(p.title) })
    if (!groups.length) wx.navigateBack()
  },
  onUnload() {
    releasePage(this.query)
  },
  onItem(e) {
    if (this.done) return
    const { gi, ii } = e.currentTarget.dataset
    const it = this.groupsRaw && this.groupsRaw[gi] && this.groupsRaw[gi].items[ii]
    if (!it || it.disabled) return
    this.done = true
    const run = () => {
      if (typeof it.onClick !== 'function') return
      try { it.onClick() } catch (err) { console.error(err) }
    }
    if (getCurrentPages().length > 1) {
      wx.navigateBack({
        success: () => setTimeout(run, 0),
        fail: () => run(),
      })
    } else {
      run()
    }
  },
}))
