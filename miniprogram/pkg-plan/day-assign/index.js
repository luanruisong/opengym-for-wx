// Plan → Schedule → a weekday (frontend/src/sheets.jsx DayAssign): tap routines to put them on the
// day or take them off (two or more make a combined day, in the order tapped); "Rest day" clears
// it and closes. The page stays open for more picks until Done. params: { day } (0 = Sunday).
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage } from '../../utils/nav.js'
import { useStore } from '../../store/store.js'
import { glyphOf } from '../../lib/glyphs.js'
import { exCount, DAYN } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'

const dayOfPage = page => {
  const d = pageParams(page.query).day
  return d == null ? null : Number(d)
}

Page(connectPage({
  data: { routines: [], restOn: false },
  // Runs once before onLoad too, so the day comes from the query, not this.params.
  mapState(S) {
    const day = dayOfPage(this)
    if (day == null) return {}
    const cur = [].concat((S.week || {})[day] || [])
    return {
      restOn: !cur.length,
      routines: (S.routines || []).map(r => ({
        id: r.id,
        name: r.name,
        glyph: glyphOf(r.emoji),
        sub: exCount((r.ex || []).length),
        on: cur.includes(r.id),
      })),
    }
  },
  onLoad(query) {
    this.params = pageParams(query)
    this.day = dayOfPage(this)
    if (this.day == null || !DAYN[this.day]) { wx.navigateBack(); return }
    wx.setNavigationBarTitle({ title: t(DAYN[this.day]) })
  },
  onUnload() {
    releasePage(this.query)
  },
  onToggle(e) {
    if (this.done || this.day == null) return
    const id = e.currentTarget.dataset.id
    const day = this.day
    useStore.getState().update(s => {
      if (!s.week) s.week = {}
      const ids = [].concat(s.week[day] || [])
      const next = ids.includes(id) ? ids.filter(x => x !== id) : ids.concat([id])
      if (next.length) s.week[day] = next
      else delete s.week[day]
    })
  },
  onRest() {
    if (this.done || this.day == null) return
    this.done = true
    const day = this.day
    useStore.getState().update(s => { if (s.week) delete s.week[day] })
    wx.navigateBack()
  },
  onDone() {
    if (this.done) return
    this.done = true
    wx.navigateBack()
  },
}))
