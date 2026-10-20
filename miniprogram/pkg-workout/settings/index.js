// WorkoutSettings (frontend/src/components/WorkoutSettingsSheet.jsx): the settings touched at the
// gym, from the workout's ⋯ → Workout settings. Every row writes the same S.* field as Settings,
// so a change sticks for the next session too. Layout here is the saved one: picking it clears
// the running session's own (S.active.workoutView).
import { connectPage } from '../../utils/page.js'
import { releasePage, back, navTo } from '../../utils/nav.js'
import { useStore } from '../../store/store.js'
import { durationSheet } from '../../utils/sheets.js'
import { t } from '../../lib/i18n.js'
import { effortOf } from '../../lib/history.js'
import { workoutControls } from '../../lib/workout-controls.js'
import { unlock } from '../../lib/sound.js'
import { wakeLockSupported } from '../../lib/wakelock.js'
import { REST_MAX, fmtRest } from '../../lib/duration.js'

const update = fn => useStore.getState().update(fn)

Page(connectPage({
  data: {
    layoutOpts: [], effortOpts: [],
  },
  mapState(S) {
    const lv = (S.active && S.active.workoutView) || S.workoutView
    const wakeOK = wakeLockSupported()
    return {
      restText: fmtRest(S.restSec),
      sound: !!S.sound,
      vibrate: S.vibrate !== false,
      flash: !!S.timerFlash,
      wakeOK,
      keepAwake: wakeOK && S.keepAwake !== false,
      layout: ['list', 'compact'].includes(lv) ? lv : 'cards',
      effort: effortOf(S),
      swipe: workoutControls(S).swipeSets,
    }
  },
  onLoad() {
    this.setData({
      layoutOpts: [{ value: 'cards', label: t('Cards') }, { value: 'list', label: t('List') }, { value: 'compact', label: t('Compact') }],
      effortOpts: [{ value: 'none', label: t('Off') }, { value: 'rir', label: t('RIR') }, { value: 'rpe', label: t('RPE') }],
    })
  },
  onUnload() { releasePage(this.query) },
  onDone() { if (!this.closed) { this.closed = true; back() } },
  onRest() {
    durationSheet({
      title: t('Rest timer'), value: useStore.getState().S.restSec, max: REST_MAX, off: t('Off'),
      footer: t('Scroll to 0:00 to turn the rest timer off.'),
      onDone: v => update(s => { s.restSec = v }),
    })
  },
  onSound(e) {
    const v = !!e.detail.value
    if (v) unlock(true)
    update(s => { s.sound = v })
  },
  onVibrate(e) { const v = !!e.detail.value; update(s => { s.vibrate = v }) },
  onFlash(e) { const v = !!e.detail.value; update(s => { s.timerFlash = v }) },
  onAwake(e) { const v = !!e.detail.value; update(s => { s.keepAwake = v }) },
  onLayout(e) { const v = e.detail.value; update(s => { s.workoutView = v; if (s.active) delete s.active.workoutView }) },
  onEffort(e) { const v = e.detail.value; update(s => { s.effort = v; delete s.showRir }) },
  onSwipe(e) { const v = !!e.detail.value; update(s => { s.wc = { ...workoutControls(s), swipeSets: v } }) },
  onAll() {
    if (this.closed) return
    this.closed = true
    navTo('/settings/workout', { replace: true })
  },
}))
