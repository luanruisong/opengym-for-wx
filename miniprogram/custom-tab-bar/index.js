// The custom tab bar (frontend/src/components/TabBar.jsx): 首页 / 计划 / [开始·继续] / 统计 / 动作库.
//
// data
//   selected  Number  index of the tab page showing (0 home, 1 plan, 2 stats, 3 library); each
//                     tab page sets it in onShow:  this.getTabBar && this.getTabBar().setData({ selected: i })
// The middle button: with no session running and a routine planned for today it starts that
// session (startFlow, weigh-in first if the setting asks for it); otherwise it opens the workout
// page, which resumes the running session or offers the picker. A live session shows its running
// time in place of the label; a past workout being edited or logged after the fact has no clock.
import { connectComponent } from '../utils/page.js'
import { navTo } from '../utils/nav.js'
import { useStore } from '../store/store.js'
import { startFlow } from '../store/actions.js'
import { effectiveRoutineIds, effectiveRoutines } from '../lib/history.js'
import { todayISO } from '../lib/format.js'

const TABS = [
  { url: '/pages/home/index', icon: 'house', label: '首页' },
  { url: '/pages/plan/index', icon: 'calendar', label: '计划' },
  { url: '/pages/stats/index', icon: 'chart', label: '统计' },
  { url: '/pages/library/index', icon: 'dumbbell', label: '动作库' },
]

const clock = start => {
  const s = Math.max(0, Math.floor((Date.now() - start) / 1000))
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}

Component(connectComponent({
  options: { styleIsolation: 'apply-shared' },
  data: {
    selected: 0,
    left: TABS.slice(0, 2),
    right: TABS.slice(2),
    rec: false,       // a session exists (orange disc)
    running: false,   // a live session: show its clock
    startAt: 0,
    startLabel: '开始',
    elapsed: '0:00',
  },
  mapState(S) {
    const a = S.active
    const running = !!a && !a.editingWorkoutId && !a.backfill && a.start > 0
    return {
      rec: !!a,
      running,
      startAt: running ? a.start : 0,
      startLabel: a ? (a.editingWorkoutId ? '编辑训练' : '继续') : '开始',
    }
  },
  observers: {
    'running, startAt'(running) { running ? this.tickStart() : this.tickStop() },
  },
  lifetimes: {
    detached() { this.tickStop() },
  },
  pageLifetimes: {
    show() { if (this.data.running) this.tickStart() },
    hide() { this.tickStop() },
  },
  methods: {
    tickStart() {
      this.tickStop()
      const tick = () => {
        const e = clock(this.data.startAt)
        if (e !== this.data.elapsed) this.setData({ elapsed: e })
      }
      tick()
      this._iv = setInterval(tick, 1000)
    },
    tickStop() {
      if (this._iv) { clearInterval(this._iv); this._iv = null }
    },
    onTab(e) {
      const i = +e.currentTarget.dataset.i
      const tab = TABS[i]
      if (!tab) return
      if (i !== this.data.selected) this.setData({ selected: i })
      wx.switchTab({ url: tab.url })
    },
    onStart() {
      const S = useStore.getState().S
      if (!S.active) {
        // A weekday can hold several routines; start the combined session if any of them has
        // exercises, otherwise fall through to the workout page's picker.
        const today = todayISO()
        if (effectiveRoutines(S, today).some(r => r.ex && r.ex.length)) {
          startFlow(effectiveRoutineIds(S, today))
          return
        }
      }
      navTo('/workout')
    },
  },
}))
