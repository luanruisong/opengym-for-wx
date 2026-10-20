// Log body weight (frontend/src/sheets.jsx BwSheet), opened by utils/sheets.js#bwSheet(opts).
// params: the original props — { required, onDone }.
//   required  the pre-workout weigh-in (startFlow / repeatWorkout): titled 快速称重, the save
//             button says 保存并开始训练, plus 不称重直接开始 (onDone(null)) and 选择其他训练
//             (back, then /workout). The original opened it `locked` so only those buttons and
//             its ✕ left it; the ✕ was a plain close with no onDone. Here the navigation bar's
//             back is that ✕: leaving that way calls nothing, so the page underneath stays as it was.
//   onDone(n) called with the saved weight instead of the 体重已保存 toast. Callback first, then
//             back: a callback that navigates (beginWorkout → navToWorkout) waits for the back
//             through store/actions.js afterSheet.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage } from '../../utils/nav.js'
import { weighInsSheet } from '../../utils/sheets.js'
import { closeThenNav } from '../../store/actions.js'
import { lastBW } from '../../lib/history.js'
import { fmtDate, todayISO } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { S, update, toast, bwTooHeavy, weighInRow, deleteWeighIn } from '../_shared.js'

Page(connectPage({
  data: { required: false, sub: '', v: 70, unit: 'kg', recent: [], more: false },
  mapState(st) {
    const recent = [...st.bodyweight].reverse().slice(0, 3)
    return {
      unit: st.unit,
      recent: recent.map(b => weighInRow(b, st.unit)),
      more: st.bodyweight.length > recent.length,
    }
  },
  onLoad(query) {
    const p = pageParams(query)
    this.params = p
    const required = !!p.required
    const bw = lastBW(S())
    this.setData({
      required,
      v: bw ? bw.w : 70,
      sub: required ? t('Slide or tap to set your weight. We ask before every workout so your curve stays honest.') : t('Today') + ', ' + fmtDate(todayISO(), true),
    })
    wx.setNavigationBarTitle({ title: required ? t('Quick check-in') : t('Log body weight') })
  },
  onUnload() { releasePage(this.query) },
  onV(e) { this.setData({ v: e.detail.value }) },
  leave() {
    if (getCurrentPages().length > 1) wx.navigateBack()
  },
  onSave() {
    if (this.done) return
    const n = Math.round((this.data.v || 0) * 10) / 10
    if (!n || n <= 0) { toast(t('Enter a valid weight')); return }
    if (bwTooHeavy(n, S().unit)) return
    this.done = true
    update(s => {
      const iso = todayISO()
      const ex = s.bodyweight.find(b => b.d === iso)
      if (ex) { ex.w = n; ex.t = Date.now() } else s.bodyweight.push({ d: iso, w: n, t: Date.now() })
      s.bodyweight.sort((a, b) => (a.d < b.d ? -1 : 1))
    })
    const onDone = this.params.onDone
    if (typeof onDone === 'function') {
      try { onDone(n) } catch (err) { console.error(err) }
    } else toast(t('Weight saved'))
    this.leave()
  },
  onSkip() {
    if (this.done) return
    this.done = true
    const onDone = this.params.onDone
    if (typeof onDone === 'function') {
      try { onDone(null) } catch (err) { console.error(err) }
    }
    this.leave()
  },
  onDifferent() {
    if (this.done) return
    this.done = true
    closeThenNav(() => this.leave(), '/workout')
  },
  onDelete(e) { deleteWeighIn(e.currentTarget.dataset.d, false) },
  onAll() { weighInsSheet() },
}))
