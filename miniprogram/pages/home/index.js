// Home (tab 0) — frontend/src/views/Home.jsx + components/QueueRow.jsx: what to do now and a
// quick glance (week strip or rotation progress, today row, check-in, welcome, body weight,
// streak). Deep charts and history live in Stats.
import { connectPage } from '../../utils/page.js'
import { navTo } from '../../utils/nav.js'
import { useStore } from '../../store/store.js'
import { startFlow, bwDeltaColor } from '../../store/actions.js'
import { bwSheet, goalSheet, dayOverrideSheet, calendarSheet, starterPlanSheet, weighInsSheet } from '../../utils/sheets.js'
import { effectiveRoutines, effectiveRoutineIds, nextTrainingDay, streakWeeks, lastBW } from '../../lib/history.js'
import { fmtNum, fmtDate, todayISO, isoOf, weekStartOf, weekDayOffset, DAYS, DAYN } from '../../lib/format.js'
import { t, tn } from '../../lib/i18n.js'
import { queueOf, queueView, weekTally, pinState } from '../../lib/queue.js'
import { scheduleModeOf } from '../../lib/rotation.js'
import { glyphOf } from '../../lib/glyphs.js'
import { dayNoteOf } from '../../lib/day-notes.js'

const md = d => (d.getMonth() + 1) + '月' + d.getDate() + '日'

// The coach-week / rotation progress row (QueueRow.jsx).
function queueRow(S, today, managed) {
  const v = queueView(S, today)
  if (!v) return null
  const word = { done: t('Done'), next: t('Up next'), later: t('Later') }
  const next = v.items.find(i => i.state === 'next')
  const pinned = v.items.filter(i => i.state === 'pinned').sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0))[0]
  const shownToday = !!next && effectiveRoutineIds(S, today, today).includes(next.id)
  const status = v.complete ? (managed ? t('Round complete') : t('Week complete, ask the coach'))
    : v.waiting ? (managed ? t('Next round starts {0}.', fmtDate(v.startsOn, true)) : t('Next week starts {0}', fmtDate(v.startsOn, true)))
    : shownToday ? t('Next: {0}, today', next.name)
    : next ? t('Next: {0}', next.name)
    : pinned ? t('Next: {0}', pinned.name + ' · ' + fmtDate(pinned.on, true)) : ''
  const doneN = v.items.length - v.remaining.length
  return {
    label: managed ? t('Rotation') : v.label,
    count: managed ? t('{0} of {1} done this round.', doneN, v.items.length) : doneN + ' / ' + v.items.length,
    chips: v.items.map((i, k) => ({
      k, id: i.id, name: i.name, on: i.state === 'next', done: i.state === 'done',
      word: i.state === 'pinned' ? fmtDate(i.on, true) : word[i.state],
    })),
    status,
  }
}

Page(connectPage({
  data: { weekOffset: 0 },

  mapState(S, { ui }) {
    const weekOffset = this.weekOffset || 0
    const now = new Date()
    const today = todayISO()
    const todayRoutines = effectiveRoutines(S, today)
    const routine = todayRoutines[0] || null
    const todayOvr = S.dayPlan[today] !== undefined && pinState(S, S.dayPlan[today]) !== 'done'
    const A = S.active
    const editingSaved = !!(A && A.editingWorkoutId)

    // week strip
    const wkStart = new Date(now)
    wkStart.setDate(now.getDate() - weekDayOffset(now.getDay(), weekStartOf(S)) + weekOffset * 7)
    const doneDays = new Set(S.workouts.map(w => w.d))
    const days = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(wkStart); d.setDate(wkStart.getDate() + i)
      const iso = isoOf(d)
      const eff = effectiveRoutineIds(S, iso).length > 0, ovr = S.dayPlan[iso] !== undefined
      const dot = doneDays.has(iso) ? 'done' : dayNoteOf(S, iso) ? 'noted' : ovr && eff ? 'ovr' : eff ? 'plan' : ''
      days.push({ k: i, iso, lbl: t(DAYS[d.getDay()]), num: d.getDate(), today: iso === today, dot })
    }
    const wkEnd = new Date(wkStart); wkEnd.setDate(wkStart.getDate() + 6)
    const weekLabel = weekOffset === 0 ? t('This week') : md(wkStart) + ' – ' + md(wkEnd)

    // what today's row reports
    const loggedToday = S.workouts.filter(w => w.d === today)
    const liveQ = queueOf(S)
    const queueIds = (liveQ && liveQ.ids) || []
    const coveredToday = id => !queueIds.includes(id) && loggedToday.some(w => (Array.isArray(w.routineIds) ? w.routineIds : [w.routineId]).includes(id))
    const doneToday = (todayRoutines.every(r => coveredToday(r.id)) && loggedToday[loggedToday.length - 1]) || null

    const rotating = scheduleModeOf(S) === 'rotation'
    const hasQueue = !!queueView(S, today)
    const plannerQueue = hasQueue && !(liveQ && liveQ.rotationId)
    const managed = !!liveQ && !!S.rotation && liveQ.rotationId === S.rotation.id
    const next = !A && !todayRoutines.length && !(rotating && !plannerQueue) ? nextTrainingDay(S, today) : null

    let tIcon, tBg, tIconColor = '', tTitle, tTag = '', tTagCls = ''
    if (A) {
      tIcon = editingSaved ? 'pencil' : 'play'; tBg = 'var(--orange)'
      tTitle = editingSaved ? A.name : t('{0} (in progress)', A.name)
      tTag = editingSaved ? t('Edit') : t('Resume'); tTagCls = 'tag-or'
    } else if (doneToday) {
      tIcon = 'checkCircle'; tBg = 'var(--surface-3)'; tIconColor = 'var(--green)'
      tTitle = doneToday.name ? t('{0} (done)', doneToday.name) : t('Workout done')
      tTag = t('Done'); tTagCls = 'tag-ok'
    } else if (routine) {
      tIcon = glyphOf(routine.emoji); tBg = 'var(--acc)'
      tTitle = todayRoutines.map(r => r.name).join(' + ')
      tTag = t('Start'); tTagCls = 'acc'
    } else {
      tIcon = 'moon'; tBg = 'var(--surface-3)'; tTitle = t('Rest day')
    }
    if (todayOvr && routine && !doneToday) tTitle += ' · ' + t('rescheduled')

    // body weight
    const showWeight = S.showWeightCard !== false
    let bw = null, goalLine = '', bwPoints = []
    if (showWeight) {
      const last = lastBW(S)
      const prev = S.bodyweight.length > 1 ? S.bodyweight[S.bodyweight.length - 2] : null
      if (last) {
        const delta = prev ? last.w - prev.w : null
        bw = {
          num: fmtNum(last.w), date: fmtDate(last.d, true),
          delta: delta ? fmtNum(Math.abs(delta)) : '', up: delta > 0,
          deltaColor: delta ? bwDeltaColor(delta, last.w) : '',
        }
        if (S.targetW) {
          const gap = Math.abs(S.targetW - last.w)
          goalLine = t('Goal') + ' ' + fmtNum(S.targetW) + ' ' + S.unit + ' · ' + (gap < 0.05 ? t('reached!')
            : t(S.targetW > last.w ? '{0} to gain' : '{0} to lose', fmtNum(gap) + ' ' + S.unit))
        }
        bwPoints = S.bodyweight.slice(-30).map(b => ({ t: b.t || new Date(b.d).getTime(), y: b.w, d: b.d }))
      }
    }

    const tally = weekTally(S, today)
    return {
      resting: !!(ui.timer || ui.work),
      dateSub: md(now) + ' ' + t(DAYN[now.getDay()]),
      rotating,
      queue: rotating && hasQueue ? queueRow(S, today, managed) : null,
      weekLabel,
      days,
      tIcon, tBg, tIconColor, tTitle, tTag, tTagCls,
      tNext: next && !doneToday ? t('Next session: {0}, {1}', t(DAYN[next.weekday]), next.routine.name) : '',
      active: !!A,
      checkIn: S.checkIn !== false,
      welcome: !S.routines.length && !A,
      showWeight,
      unit: S.unit,
      targetW: S.targetW || null,
      goalBtn: S.targetW ? fmtNum(S.targetW) : t('Goal'),
      bw,
      goalLine,
      bwPoints,
      noBw: S.weighIn === false
        ? t('No weigh-ins yet. Log your weight to start the curve.')
        : t('No weigh-ins yet. Log your weight to start the curve (we also ask before every workout).'),
      streak: t('{0} week streak', streakWeeks(S)),
      streakSub: tally.done + (tally.planned ? ' / ' + tally.planned : '') + ' ' + t('this week') + ' · ' +
        tn('{0} workout total', '{0} workouts total', S.workouts.length),
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setData({ selected: 0 })
    // The date and "today" move on at midnight while the tab stays alive.
    if (this.__refresh) this.__refresh()
  },

  onPrevWeek() { this.weekOffset = (this.weekOffset || 0) - 1; this.__refresh() },
  onNextWeek() { this.weekOffset = (this.weekOffset || 0) + 1; this.__refresh() },
  onDay(e) { dayOverrideSheet(e.currentTarget.dataset.iso) },
  onToday() {
    const S = useStore.getState().S
    const today = todayISO()
    if (S.active) navTo('/workout')
    else if (effectiveRoutines(S, today).length) startFlow(effectiveRoutineIds(S, today))
    else dayOverrideSheet(today)
  },
  onQueueStart(e) {
    if (e.currentTarget.dataset.done) return
    if (useStore.getState().S.active) navTo('/workout')
    else startFlow([e.currentTarget.dataset.id])
  },
  onSettings() { navTo('/settings') },
  onWorkout() { navTo('/workout') },
  onPlan() { navTo('/plan') },
  onCheckIn() { navTo('/checkin') },
  onStarter() { starterPlanSheet() },
  onGoal() { goalSheet() },
  onLogBw() { bwSheet() },
  onWeighIns() { weighInsSheet() },
  onCalendar() { calendarSheet() },
}))
