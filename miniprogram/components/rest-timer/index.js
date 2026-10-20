// <rest-timer place="docked" />  — the rest countdown between sets, or the hold countdown of a
// timed set (frontend/src/components/RestTimer.jsx). Bound to useUI().timer / .work; renders
// nothing while neither runs. One row: the clock (tap to set the time left), then −15s, +15s,
// pause and Skip; the progress is a thin line along the top edge.
//
// properties
//   place  String  'float'  where the bar sits: 'docked' (workout page: edge to edge at the
//                           bottom), 'tabbar' (a tab page: above the custom tab bar),
//                           'float' (any other page: a card near the bottom)
// events
//   show   detail { on: boolean }  the bar appeared / went away (a page can toggle its
//                                   .page.resting padding with it; or read ui.timer in mapState)
//
// Pages that show the bar should keep room for it: class "resting" on the .page root while
// ui.timer || ui.work (app.wxss).
import { connectComponent } from '../../utils/page.js'
import { useUI } from '../../store/ui.js'
import { REST_MAX } from '../../lib/duration.js'
import { adjustRestSheet } from './adjust.js'

const clock = sec => Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0')

Component(connectComponent({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    place: { type: String, value: 'float' },
  },
  data: { on: false, mode: '', pct: 100 },
  mapState(S, { ui }) {
    const work = ui.work
    const timer = ui.timer
    const base = { on: false, mode: '', pct: 100, clock: '', label: '', ready: false, paused: false, sw: false, plusOff: false, skipLabel: '跳过' }
    if (work) {
      const pct = Math.max(0, Math.min(100, (work.left / work.total) * 100))
      return {
        ...base, on: true, mode: 'working', pct,
        clock: work.left <= 0 && work.overtime ? '+' + clock(-work.left) : clock(Math.max(0, work.left)),
        label: work.label || '',
      }
    }
    if (timer) {
      const pct = Math.max(0, Math.min(100, (timer.left / timer.total) * 100))
      return {
        ...base, on: true, mode: 'rest', pct,
        ready: !!timer.ready, paused: !!timer.paused, sw: timer.kind === 'switch',
        clock: timer.ready ? '准备好' : clock(Math.max(0, timer.left)),
        label: timer.kind === 'switch' ? '换边' : timer.paused ? '已暂停' : '休息',
        plusOff: !timer.ready && timer.left >= REST_MAX,
        skipLabel: timer.ready ? '忽略' : '跳过',
      }
    }
    return base
  },
  observers: {
    on(v) {
      if (v !== this._shown) { this._shown = v; this.triggerEvent('show', { on: !!v }) }
    },
  },
  methods: {
    onClock() { adjustRestSheet() },
    onMinus() { useUI.getState().addRest(-15) },
    onPlus() { if (!this.data.plusOff) useUI.getState().addRest(15) },
    onPause() {
      const ui = useUI.getState()
      if (ui.timer && ui.timer.paused) ui.resumeRest(); else ui.pauseRest()
    },
    onSkip() { useUI.getState().stopRest() },
    onWorkCancel() { useUI.getState().stopWork() },
    onWorkDone() { useUI.getState().finishWorkEarly() },
  },
}))
