// A plan file from a friend (frontend/src/sheets.jsx PlanImport): what is in it, and Add.
// params: { bundle } (lib/plan-share.js parsePlan's result).
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage } from '../../utils/nav.js'
import { applyPlanImport } from '../../store/actions.js'
import { routineCount, exCount } from '../../lib/format.js'
import { t, tn } from '../../lib/i18n.js'

Page(connectPage({
  data: { summary: '', dropped: '', scheduled: false, schedule: false },
  onLoad(query) {
    this.params = pageParams(query)
    const b = this.params.bundle
    if (!b) { wx.navigateBack(); return }
    wx.setNavigationBarTitle({ title: b.name ? t('Import “{0}”', b.name) : t('Import this plan') })
    const summary = routineCount(b.routineCount) + ' · ' + exCount(b.exerciseCount) +
      (b.scheduledDays > 0 ? ' · ' + tn('scheduled on {0} day', 'scheduled on {0} days', b.scheduledDays) : '')
    const dropped = b.dropped > 0
      ? t(b.dropped === 1
        ? '{0} exercise in the file isn’t in your library and was left out.'
        : '{0} exercises in the file aren’t in your library and were left out.', b.dropped)
      : ''
    this.setData({ summary, dropped, scheduled: b.scheduledDays > 0 })
  },
  onUnload() {
    releasePage(this.query)
  },
  onSchedule(e) {
    this.setData({ schedule: !!e.detail.value })
  },
  onApply() {
    const b = this.params && this.params.bundle
    if (!b || this.done) return
    this.done = true
    // Merges, toasts and heads for the Plan tab once this page is gone.
    applyPlanImport(b, { schedule: this.data.schedule })
    wx.navigateBack()
  },
  onCancel() {
    if (this.done) return
    this.done = true
    wx.navigateBack()
  },
}))
