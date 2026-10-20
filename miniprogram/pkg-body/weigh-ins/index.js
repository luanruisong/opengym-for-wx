// Every weigh-in, week by week (frontend/src/sheets.jsx WeighIns), opened by
// utils/sheets.js#weighInsSheet(). Each week under its mean and how far that moved from the
// week before; the chart plots the weekly means. Weeks start on the profile's first weekday.
import { connectPage } from '../../utils/page.js'
import { releasePage } from '../../utils/nav.js'
import { bwDeltaColor } from '../../store/actions.js'
import { weeklyWeights } from '../lib/bodyweight.js'
import { fmtDate, fmtNum, weekStartOf } from '../../lib/format.js'
import { t, tn } from '../../lib/i18n.js'
import { weighInRow, deleteWeighIn } from '../_shared.js'

Page(connectPage({
  data: { n: 0, count: '', points: [], goal: null, unit: 'kg', weeks: [] },
  mapState(st) {
    const weeks = weeklyWeights(st.bodyweight, weekStartOf(st))
    const points = [...weeks].reverse()
      .map(w => ({ t: new Date(w.key + 'T12:00:00').getTime(), y: Math.round(w.avg * 100) / 100, d: w.key }))
    const n = weeks.reduce((sum, w) => sum + w.n, 0)
    return {
      n,
      count: tn('{0} weigh-in', '{0} weigh-ins', n),
      points,
      goal: st.targetW || null,
      unit: st.unit,
      weeks: weeks.map(w => {
        // Only a change the display can show: at one decimal 0.02 kg is "0".
        const moved = w.delta != null && fmtNum(Math.abs(w.delta)) !== fmtNum(0)
        return {
          key: w.key,
          title: t('Week of {0}', fmtDate(w.key)),
          moved,
          up: w.delta > 0,
          delta: moved ? fmtNum(Math.abs(w.delta)) : '',
          color: moved ? bwDeltaColor(w.delta, w.avg) : '',
          avg: t('Average {0}', fmtNum(w.avg) + ' ' + st.unit),
          entries: w.entries.map(b => weighInRow(b, st.unit)),
        }
      }),
    }
  },
  onUnload() { releasePage(this.query) },
  onDelete(e) { deleteWeighIn(e.currentTarget.dataset.d, true) },
}))
