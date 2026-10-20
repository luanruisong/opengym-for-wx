// The workout screen's Finish pill (frontend/src/sheets.jsx finishWorkoutSheet, v1.3.11): both
// ways out on one page, Finish and save or Discard, with what finishWorkout's confirm would have
// said about sets still unchecked. params: { onDiscard } — the screen's own discard, with its
// confirm (store/actions.js discardWorkout). The editor of a saved workout saves at once.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage, back } from '../../utils/nav.js'
import { useStore } from '../../store/store.js'
import { finishWorkoutPrompt, doFinishWorkout, saveWorkoutEdits } from '../../store/actions.js'

// Back to the page below, then `fn` there (it may open a modal or another page).
const backThen = fn => {
  if (getCurrentPages().length > 1) wx.navigateBack({ success: () => setTimeout(fn, 0), fail: () => fn() })
  else fn()
}

Page(connectPage({
  data: { subtitle: '', canDiscard: false },
  onLoad(query) {
    const p = pageParams(query)
    this.params = p
    const A = useStore.getState().S.active
    if (A && A.editingWorkoutId) { this.done = true; backThen(() => saveWorkoutEdits()); return }
    const prompt = finishWorkoutPrompt()
    if (!prompt) { this.done = true; back(); return }
    wx.setNavigationBarTitle({ title: prompt.title })
    this.setData({ subtitle: prompt.subtitle || '', canDiscard: typeof p.onDiscard === 'function' })
  },
  onUnload() { releasePage(this.query) },
  onFinish() {
    if (this.done) return
    this.done = true
    // doFinishWorkout files the session, then (once this page is gone, afterSheet) puts the
    // summary in the workout page's place.
    doFinishWorkout()
    back()
  },
  onDiscard() {
    if (this.done) return
    this.done = true
    const fn = this.params && this.params.onDiscard
    backThen(() => { if (typeof fn === 'function') fn() })
  },
}))
