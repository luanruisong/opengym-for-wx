// The three note sheets of frontend/src/sheets.jsx as one page: ExerciseNote (today's note with
// its "show next time" pin, plus the exercise's standing note), SetNote and SessionNote.
// params: { kind: 'exercise' | 'set' | 'session', entryIdx, setIdx }
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage, back } from '../../utils/nav.js'
import { useStore } from '../../store/store.js'
import { exOr } from '../../lib/exercises.js'
import { t, exerciseNameFor } from '../../lib/i18n.js'
import { NOTE_MAX } from '../../lib/history.js'

const targetOf = (S, p) => {
  const A = S && S.active
  if (!A) return null
  if (p.kind === 'session') return A
  const e = A.entries && A.entries[p.entryIdx]
  if (!e) return null
  if (p.kind === 'set') return (e.sets && e.sets[p.setIdx]) || null
  return e
}

Page(connectPage({
  data: { kind: 'session', note: '', pin: false, standing: '', editing: false, noteEmpty: true, max: NOTE_MAX },
  mapState(S) {
    // The target went away under the page (the workout finished, the exercise was removed).
    const p = pageParams(this.query)
    if (!this.closed && this.loaded && !targetOf(S, p)) { this.closed = true; setTimeout(() => back(), 0) }
    return {}
  },
  onLoad(query) {
    const p = pageParams(query)
    this.params = p
    const S = useStore.getState().S
    const target = targetOf(S, p)
    this.loaded = true
    if (!target) { this.closed = true; back(); return }
    const kind = p.kind === 'set' || p.kind === 'exercise' ? p.kind : 'session'
    const editing = !!S.active.editingWorkoutId
    const note = target.note || ''
    const data = { kind, note, editing, noteEmpty: !note.trim() }
    if (kind === 'exercise') {
      data.pin = !!target.notePin
      data.standing = (S.exNotes && S.exNotes[target.id]) || ''
      wx.setNavigationBarTitle({ title: exerciseNameFor(exOr(target.id)) })
    } else {
      wx.setNavigationBarTitle({ title: kind === 'set' ? t('Set note') : t('Session note') })
    }
    this.setData(data)
  },
  onUnload() { releasePage(this.query) },
  onNote(e) { const note = e.detail.value; this.setData({ note, noteEmpty: !note.trim() }) },
  onStanding(e) { this.setData({ standing: e.detail.value }) },
  onPin(e) { this.setData({ pin: !!e.detail.value }) },
  onSave() {
    if (this.closed) return
    const p = this.params || {}
    const { kind, note, pin, standing, editing } = this.data
    const text = note.trim().slice(0, NOTE_MAX)
    const update = useStore.getState().update
    if (kind === 'exercise') {
      const always = standing.trim().slice(0, NOTE_MAX)
      const entryId = useStore.getState().S.active?.entries?.[p.entryIdx]?.id
      update(s => {
        const e = s.active?.entries?.[p.entryIdx]
        if (e) {
          if (text) { e.note = text; if (pin) e.notePin = true; else delete e.notePin }
          else { delete e.note; delete e.notePin }
        }
        if (!editing && entryId != null) {
          s.exNotes = s.exNotes || {}
          if (always) s.exNotes[entryId] = always
          else delete s.exNotes[entryId]
        }
      })
    } else if (kind === 'set') {
      update(s => {
        const set = s.active?.entries?.[p.entryIdx]?.sets?.[p.setIdx]
        if (!set) return
        if (text) set.note = text
        else delete set.note
      }, true)
    } else {
      update(s => { if (!s.active) return; if (text) s.active.note = text; else delete s.active.note })
    }
    this.closed = true
    back()
  },
}))
