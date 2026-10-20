// WorkoutComplete (frontend/src/sheets.jsx): shown when the last set of the last exercise is
// ticked. Finish, or keep going.
//
// Two ways in: the workout page opens it on top of itself (openPage, the workout page below), and
// utils/sheets.js#workoutCompleteSheet opens it with redirect: true (it took the place of whatever
// was on top). Each way out goes back to the workout page the way it was reached.
import { connectPage } from '../../utils/page.js'
import { releasePage } from '../../utils/nav.js'
import { useUI } from '../../store/ui.js'
import { finishWorkout } from '../../store/actions.js'
import { t } from '../../lib/i18n.js'

const WORKOUT_ROUTE = 'pkg-workout/workout/index'
const overWorkout = () => {
  const ps = getCurrentPages()
  const prev = ps[ps.length - 2]
  return !!(prev && prev.route === WORKOUT_ROUTE)
}
const keepGoing = () => useUI.getState().toast(t('Keep going: tap “+ Add exercise” below'))

Page(connectPage({
  data: {},
  onUnload() { releasePage(this.query) },
  onFinish() {
    if (this.done) return
    this.done = true
    if (overWorkout()) {
      wx.navigateBack({ success: () => setTimeout(finishWorkout, 0), fail: () => finishWorkout() })
    } else {
      // From the workout page, so the finish confirm sits over it and the summary takes its place.
      wx.redirectTo({ url: '/' + WORKOUT_ROUTE, success: () => setTimeout(finishWorkout, 0), fail: () => finishWorkout() })
    }
  },
  onContinue() {
    if (this.done) return
    this.done = true
    if (overWorkout()) {
      keepGoing()
      wx.navigateBack()
    } else {
      wx.redirectTo({ url: '/' + WORKOUT_ROUTE, success: () => setTimeout(keepGoing, 0) })
    }
  },
}))
