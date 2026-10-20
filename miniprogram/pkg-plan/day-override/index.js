// One date of the plan (frontend/src/sheets.jsx DayOverride): what it would be from the weekly
// plan, and a pick of something else for just that day — a routine, a coach/loop session (a pin),
// rest, or back to the weekly plan. A missed planned day can be logged after the fact, and a day
// note added. params: { iso }.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage } from '../../utils/nav.js'
import { useStore } from '../../store/store.js'
import { useUI } from '../../store/ui.js'
import { afterSheet, canLogPastWorkout } from '../../store/actions.js'
import { dayNoteSheet, logPastWorkoutSheet } from '../../utils/sheets.js'
import { effectiveRoutineIds } from '../../lib/history.js'
import { workoutsOn } from '../../lib/backfill.js'
import { queueRemaining, pinState } from '../../lib/queue.js'
import { dayNoteOf, canNoteDay, DAY_NOTE_ICON, DAY_NOTE_LABEL } from '../../lib/day-notes.js'
import { deriveSessionName } from '../../lib/session-merge.js'
import { glyphOf } from '../../lib/glyphs.js'
import { fmtDate, exCount, todayISO } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'

const isoOfPage = page => pageParams(page.query).iso

Page(connectPage({
  data: {
    weekly: '', changed: false, missed: false, canNote: false,
    noteIcon: 'note', noteTitle: '', noteText: '', hasNote: false,
    coachTitle: '', coach: [], others: [], restOn: false, hasOvr: false,
  },
  // Runs once before onLoad too, so the date comes from the query, not this.params.
  mapState(S) {
    const iso = isoOfPage(this)
    if (!iso) return {}
    const dayPlan = S.dayPlan || {}
    const routines = S.routines || []
    const today = todayISO()
    const hasOvr = dayPlan[iso] !== undefined
    // A fulfilled pin reads as no override; the row to clear the leftover entry stays.
    const changed = hasOvr && pinState(S, dayPlan[iso]) !== 'done'
    const noOvr = Object.assign({}, dayPlan)
    delete noOvr[iso]
    const nameOf = id => (routines.find(r => r.id === id) || {}).name
    const weeklyNames = effectiveRoutineIds(Object.assign({}, S, { dayPlan: noOvr }), iso).map(nameOf).filter(Boolean)
    const effIds = effectiveRoutineIds(S, iso)
    const logged = workoutsOn(S, iso).length > 0
    const missed = iso < today && effIds.length > 0 && !logged
    const note = dayNoteOf(S, iso)
    const canNote = !!note || (canNoteDay(iso) && !logged)
    const remaining = queueRemaining(S)
    const ownLoop = !!S.queue && !!S.rotation && S.queue.rotationId === S.rotation.id
    const coach = remaining.map(id => routines.find(r => r.id === id)).filter(Boolean)
    // Active pins (earliest day per session, today or later).
    const pinnedOn = Object.entries(dayPlan).filter(([d, id]) => d >= today && remaining.includes(id)).sort()
      .reduce((m, [d, id]) => (m[id] ? m : Object.assign({}, m, { [id]: d })), {})
    const row = r => ({
      id: r.id,
      name: r.name,
      glyph: glyphOf(r.emoji),
      sub: pinnedOn[r.id] && pinnedOn[r.id] !== iso ? fmtDate(pinnedOn[r.id], true) : exCount((r.ex || []).length),
      on: effIds.includes(r.id),
    })
    return {
      weekly: weeklyNames.length ? deriveSessionName(weeklyNames) : t('Rest'),
      changed,
      missed,
      canNote,
      hasNote: !!note,
      noteIcon: note && note.tag ? DAY_NOTE_ICON[note.tag] : 'note',
      noteTitle: note ? (note.tag ? t(DAY_NOTE_LABEL[note.tag]) : t('Day note')) : t('Add a note for this day'),
      noteText: (note && note.text) || '',
      coachTitle: ownLoop ? t('Your loop') : t('Coach week'),
      coach: coach.map(row),
      others: routines.filter(r => !remaining.includes(r.id)).map(row),
      restOn: effIds.length === 0,
      hasOvr,
    }
  },
  onLoad(query) {
    this.params = pageParams(query)
    if (!this.params.iso) { wx.navigateBack(); return }
    wx.setNavigationBarTitle({ title: fmtDate(this.params.iso, true) })
  },
  onUnload() {
    releasePage(this.query)
  },
  set(v) {
    if (this.done) return
    const iso = this.params && this.params.iso
    if (!iso) return
    this.done = true
    const st = useStore.getState().S
    useStore.getState().update(s => {
      if (!s.dayPlan) s.dayPlan = {}
      if (!v) delete s.dayPlan[iso]
      else s.dayPlan[iso] = v
    })
    useUI.getState().toast(v === '' ? t('Back to weekly plan')
      : v === 'rest' ? t('{0} set to rest', fmtDate(iso))
      : t('{0} planned for {1}', ((st.routines || []).find(r => r.id === v) || {}).name, fmtDate(iso)))
    wx.navigateBack()
  },
  onRoutine(e) { this.set(e.currentTarget.dataset.id) },
  onRest() { this.set('rest') },
  onReset() { this.set('') },
  onLog() {
    if (this.done) return
    const iso = this.params && this.params.iso
    if (!iso || !canLogPastWorkout()) return
    this.done = true
    const routineIds = effectiveRoutineIds(useStore.getState().S, iso)
    wx.navigateBack()
    afterSheet(() => logPastWorkoutSheet({ iso, routineIds }))
  },
  onNote() {
    if (this.done) return
    const iso = this.params && this.params.iso
    if (iso) dayNoteSheet(iso)
  },
}))
