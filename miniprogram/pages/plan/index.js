// Plan (tab 1) — frontend/src/views/Plan.jsx. Two views: Schedule (how you train, and when) and
// Routines (what you train). The last one looked at comes back (per device, wx storage).
// Drag-to-reorder becomes up/down buttons in Edit mode; the swipe actions become a long press
// (wx.showActionSheet), on when Settings → Swipe actions (S.wc.swipeSets) is.
import { connectPage } from '../../utils/page.js'
import { navTo, takeTabQuery } from '../../utils/nav.js'
import { storage } from '../../utils/storage.js'
import { menuSheet, confirmSheet, dayAssignSheet, starterPlanSheet, planToolsSheet } from '../../utils/sheets.js'
import { useStore } from '../../store/store.js'
import { useUI } from '../../store/ui.js'
import { planHasRoutines, printWholePlan, importPlanFile } from '../../store/actions.js'
import { DAYS, weekOrder, weekStartOf, uid, exCount, routineCount, todayISO, fmtDate } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { copyRoutine, deleteRoutine } from '../../lib/routines.js'
import { workoutControls } from '../../lib/workout-controls.js'
import { glyphOf, DEFAULT_GLYPH } from '../../lib/glyphs.js'
import { queueOf, queueView } from '../../lib/queue.js'
import { deriveSessionName } from '../../lib/session-merge.js'
import {
  scheduleModeOf, queueRecovery, rotationIds, saveRotation, startNewPass, startPass,
  chooseRotation, chooseFixedWeek,
} from '../../lib/rotation.js'
import { deleteRoutineWithUndo, takeOutOfLoop, setLoop } from './plan-ops.js'

const VIEW_KEY = 'gym_plan_view'
const update = mut => useStore.getState().update(mut)
const moved = (list, from, to) => { const a = list.slice(); const [m] = a.splice(from, 1); a.splice(to, 0, m); return a }

// The loop as the editor sees it: the live pass when there is one, else the saved sequence.
function loopOf(S) {
  const liveQ = queueOf(S)
  const seq = (liveQ && liveQ.ids) || rotationIds(S)
  const label = (liveQ && liveQ.label) || (S.rotation && S.rotation.label) || ''
  const managed = !!liveQ && !!S.rotation && liveQ.rotationId === S.rotation.id
  return { liveQ, seq, label, managed, external: !!liveQ && !managed }
}

Page(connectPage({
  data: {
    viewOpts: [{ value: 'schedule', label: '日程' }, { value: 'routines', label: '训练计划' }],
    modeOpts: [{ value: 'week', label: '固定周' }, { value: 'rotation', label: '轮换' }],
  },

  mapState(S, { ui }) {
    if (this.view == null) this.view = storage.getItem(VIEW_KEY) === 'routines' ? 'routines' : 'schedule'
    const mode = scheduleModeOf(S)
    const routineOf = id => S.routines.find(x => x.id === id)
    const base = {
      resting: !!(ui.timer || ui.work),
      view: this.view,
      sub: mode === 'rotation' ? t('Your routines in a loop') : t('Your weekly routine'),
      hasRoutines: S.routines.length > 0,
    }
    const order = weekOrder(weekStartOf(S))

    if (this.view === 'routines') {
      const edit = !!this.editR
      const n = S.routines.length
      const daysOf = id => order.filter(d => [].concat(S.week[d] || []).includes(id)).map(d => t(DAYS[d]))
      return Object.assign(base, {
        editR: edit,
        routines: S.routines.map((r, i) => ({
          id: r.id, i, name: r.name, glyph: glyphOf(r.emoji),
          ss: [exCount(r.ex.length), daysOf(r.id).join(', ')].filter(Boolean).join(' · '),
          up: i > 0, down: i < n - 1,
        })),
        multi: n > 1,
        routinesFoot: edit ? '用箭头调整顺序。点减号可删除。'
          : workoutControls(S).swipeSets ? '点训练日即可编辑，长按可复制或删除。调整顺序和删除在“编辑”里。'
          : t('Tap a routine to edit it. Reorder and delete are behind Edit.'),
      })
    }

    const { liveQ, seq, external } = loopOf(S)
    const qv = liveQ ? queueView(S, todayISO()) : null
    const recovery = queueRecovery(S)
    const editing = !!this.editLoop && !external
    const todayDow = new Date().getDay()
    const dayRoutines = d => [].concat(S.week[d] || []).map(routineOf).filter(Boolean)
    const dayRow = (d, rs) => ({
      d, n: t(DAYS[d]), today: d === todayDow, rest: !rs.length,
      icon: rs.length ? glyphOf(rs[0].emoji) : 'moon',
      tt: rs.length ? deriveSessionName(rs.map(r => r.name)) : t('Rest day'),
      ss: rs.length === 1 ? exCount(rs[0].ex.length) : rs.length ? routineCount(rs.length) : t('Tap to plan something'),
    })
    const out = Object.assign(base, {
      mode, external, recovery,
      modeFoot: mode === 'rotation'
        ? t('Routines in a loop. Whatever is next stays next until you train it, whatever the day.')
        : t('The same routines on the same weekdays, every week.'),
    })
    if (mode === 'week') {
      out.weekDays = order.map(d => dayRow(d, dayRoutines(d)))
      return out
    }
    const stateWord = item => item.state === 'pinned' ? fmtDate(item.on, true)
      : { done: t('Done'), next: t('Up next'), later: t('Later') }[item.state]
    const doneCount = qv ? qv.items.filter(i => i.state === 'done').length : 0
    let loopFoot = ''
    if (seq.length) {
      loopFoot = (qv ? (qv.waiting ? t('Next round starts {0}.', fmtDate(qv.startsOn, true)) : t('{0} of {1} done this round.', doneCount, qv.items.length)) + ' ' : '') +
        (external ? '' : editing ? '用箭头调整顺序。点减号可移除一个。' : t('Trained out of order? Just pick another routine on Home.'))
    }
    return Object.assign(out, {
      editing,
      loop: seq.map((id, i) => {
        const r = routineOf(id)
        const item = qv && qv.items[i]
        return {
          id, i, name: r ? r.name : id, glyph: glyphOf(r && r.emoji),
          done: !!item && item.state === 'done', next: !!item && item.state === 'next',
          ss: item ? stateWord(item) : r ? exCount(r.ex.length) : '',
          up: i > 0, down: i < seq.length - 1,
        }
      }),
      loopMulti: seq.length > 1,
      canAdd: !S.routines.every(r => seq.includes(r.id)),
      loopFoot,
      showOver: !!liveQ && !external,
      showStart: !liveQ && !recovery && seq.length > 0,
      extraDays: order.map(d => dayRow(d, dayRoutines(d).filter(r => !seq.includes(r.id)))).filter(x => !x.rest)
    })
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setData({ selected: 1 })
    takeTabQuery('/pages/plan/index')
  },

  /* ---------- header ---------- */
  onMenu() {
    const has = planHasRoutines(useStore.getState().S)
    menuSheet({
      title: t('Plan'),
      subtitle: has ? null : t('Add an exercise to a routine first. An empty plan has nothing to share.'),
      items: [
        { icon: 'share', label: t('Export plan file'), sub: t('A small file a friend can import into their own openGym. Routines only, none of your workouts or weigh-ins.'), disabled: !has, onClick: () => planToolsSheet() },
        // wx.shareFileMessage needs a live tap, which the menu page's deferred onClick is not, so
        // the export goes through the tools page, whose own button calls exportPlanFile.
        { icon: 'note', label: t('Print / Save as PDF'), sub: '复制计划文本到剪贴板', disabled: !has, onClick: printWholePlan },
        { icon: 'download', label: t('Import a plan file'), onClick: () => importPlanFile() },
        { icon: 'clipboard', label: t('Load starter plan'), onClick: starterPlanSheet },
      ],
    })
  },
  onView(e) {
    this.view = e.detail.value === 'routines' ? 'routines' : 'schedule'
    storage.setItem(VIEW_KEY, this.view)
    this.__refresh()
  },
  onStarter() { starterPlanSheet() },

  /* ---------- schedule ---------- */
  onMode(e) {
    const v = e.detail.value
    const S = useStore.getState().S
    if (v === scheduleModeOf(S)) return
    if (v === 'rotation') { update(s => { chooseRotation(s) }); return }
    if (!queueOf(S)) { update(s => { chooseFixedWeek(s) }); return }
    confirmSheet({
      title: t('Back to a fixed week?'),
      message: t('The loop stops. Your weekdays stay as they are, and the loop is saved for later.'),
      confirmText: t('Use Fixed Week'),
      onConfirm: () => update(s => { chooseFixedWeek(s) })
    })
  },
  onDiscardQueue() { update(s => { s.queue = null; s.scheduleMode = 'week' }) },
  onDay(e) { dayAssignSheet(+e.currentTarget.dataset.d) },
  onEditLoop() { this.editLoop = !this.editLoop; this.__refresh() },
  onAddToLoop() {
    const S = useStore.getState().S
    const { seq, label } = loopOf(S)
    menuSheet({
      title: t('Add to the rotation'),
      items: S.routines.filter(r => !seq.includes(r.id)).map(r => ({
        icon: glyphOf(r.emoji), label: r.name, onClick: () => setLoop(seq.concat(r.id), label),
      })),
    })
  },
  takeOut(id) {
    const { seq, label } = loopOf(useStore.getState().S)
    takeOutOfLoop(id, ids => setLoop(ids, label), seq, label)
  },
  onLoopMinus(e) { this.takeOut(e.currentTarget.dataset.id) },
  onLoopMove(e) {
    const { i, dir } = e.currentTarget.dataset
    const { seq, label } = loopOf(useStore.getState().S)
    const to = +i + (+dir)
    if (to < 0 || to >= seq.length) return
    setLoop(moved(seq, +i, to), label)
  },
  onLoopLong(e) {
    const S = useStore.getState().S
    if (!workoutControls(S).swipeSets || loopOf(S).external || this.editLoop) return
    const id = e.currentTarget.dataset.id
    wx.showActionSheet({ itemList: [t('Remove')], itemColor: '#ff453a', success: r => { if (r.tapIndex === 0) this.takeOut(id) } })
  },
  onAdopt() {
    const S = useStore.getState().S
    const { seq } = loopOf(S)
    const own = (S.rotation && S.rotation.sequence) || []
    const replacesOwn = own.length > 0 && (own.length !== seq.length || own.some((id, i) => id !== seq[i]))
    confirmSheet({
      title: t('Use this rotation?'),
      message: t('Your coach gives up control of this week: openGym owns the queue from here on and repeats these sessions by itself once they are all done. A new week from the coach’s app would replace this rotation.')
        + (replacesOwn ? ' ' + t('Your own loop gets replaced.') : ''),
      confirmText: t('Use this rotation'),
      onConfirm: () => update(s => { saveRotation(s, seq, '') }),
    })
  },
  onStartOver() { update(s => { startNewPass(s) }) },
  onStartLoop() { update(s => { startPass(s) }) },
  onVolume() { navTo('/stats?focus=weekly-volume') },

  /* ---------- routines ---------- */
  onEditR() { this.editR = !this.editR; this.__refresh() },
  onNewRoutine() {
    const r = { id: uid(), name: t('New routine'), emoji: DEFAULT_GLYPH, ex: [] }
    update(s => { s.routines.push(r) })
    navTo('/plan/r/' + r.id)
  },
  onRoutine(e) { navTo('/plan/r/' + e.currentTarget.dataset.id) },
  onRoutineMinus(e) { deleteRoutineWithUndo(e.currentTarget.dataset.id) },
  onRoutineMove(e) {
    const from = +e.currentTarget.dataset.i
    const to = from + (+e.currentTarget.dataset.dir)
    update(s => {
      if (to < 0 || to >= s.routines.length) return
      const [m] = s.routines.splice(from, 1)
      s.routines.splice(to, 0, m)
    })
  },
  onRoutineLong(e) {
    const S = useStore.getState().S
    if (!workoutControls(S).swipeSets) return
    const r = S.routines.find(x => x.id === e.currentTarget.dataset.id)
    if (!r) return
    wx.showActionSheet({
      itemList: [t('Duplicate'), t('Delete')],
      success: res => {
        if (res.tapIndex === 0) this.duplicate(r)
        else if (res.tapIndex === 1) deleteRoutineWithUndo(r.id)
      },
    })
  },
  // A copy right below the original, staying on this list, with its own Undo.
  duplicate(r) {
    const copy = copyRoutine(r, t('Copy'))
    update(s => {
      const at = s.routines.findIndex(x => x.id === r.id)
      s.routines.splice(at < 0 ? s.routines.length : at + 1, 0, copy)
    })
    useUI.getState().toast(t('Copied as “{0}”.', copy.name), {
      action: t('Undo'),
      onAction: () => update(s => { if (s.routines.some(x => x.id === copy.id)) deleteRoutine(s, copy.id) }),
    })
  },
}))
