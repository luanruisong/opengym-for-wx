// Target weight (frontend/src/sheets.jsx GoalSheet), opened by utils/sheets.js#goalSheet().
import { connectPage } from '../../utils/page.js'
import { releasePage } from '../../utils/nav.js'
import { lastBW } from '../../lib/history.js'
import { fmtNum } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { S, update, toast, bwTooHeavy, goBack } from '../_shared.js'

Page(connectPage({
  data: { v: 70, unit: 'kg', hasGoal: false },
  mapState(st) { return { unit: st.unit, hasGoal: !!st.targetW } },
  onLoad() {
    const st = S()
    const bw = lastBW(st)
    this.setData({ v: st.targetW || (bw ? bw.w : 70) })
  },
  onUnload() { releasePage(this.query) },
  onV(e) { this.setData({ v: e.detail.value }) },
  onSave() {
    if (this.done) return
    const unit = S().unit
    const n = Math.round((this.data.v || 0) * 10) / 10
    if (!n || n <= 0) { toast(t('Enter a valid weight')); return }
    if (bwTooHeavy(n, unit)) return
    this.done = true
    update(s => { s.targetW = n })
    const b = lastBW(S())
    toast(t('Goal set: {0}', fmtNum(n) + ' ' + unit) + (b ? ' (' + t('{0} to go', fmtNum(Math.abs(n - b.w))) + ')' : ''))
    goBack()
  },
  onRemove() {
    if (this.done) return
    this.done = true
    update(s => { s.targetW = null })
    toast(t('Goal removed'))
    goBack()
  },
}))
