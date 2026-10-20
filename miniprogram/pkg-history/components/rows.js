// Display models for the history list rows (sheets.jsx WorkoutRow / DayNoteRow): the page works
// them out once and hands plain strings to <workout-row> / <day-note-row>, so a row does not
// subscribe to the store itself.
import { fmtDate, durPart, fmtVol } from '../../lib/format.js'
import { setsDone } from '../../lib/history.js'
import { glyphOf } from '../../lib/glyphs.js'
import { workoutMediaOf } from '../../lib/media-refs.js'
import { DAY_NOTE_LABEL, DAY_NOTE_ICON } from '../../lib/day-notes.js'
import { t, tn } from '../../lib/i18n.js'

// { key, name, sub, glyph, mediaN, mediaLabel, prN }
export function workoutRowOf(S, w, key) {
  const r = (S.routines || []).find(x => x.id === w.routineId) || {}
  const mediaN = workoutMediaOf(w).length
  return {
    key: key != null ? key : String(w.id),
    name: w.name || '',
    sub: [fmtDate(w.d, true), ...durPart((w.end || 0) - (w.start || 0)), tn('{0} set', '{0} sets', setsDone(w)), fmtVol(w.vol, S.unit)].join(' · '),
    glyph: glyphOf(r.emoji),
    mediaN,
    mediaLabel: mediaN ? tn('{0} photo or video', '{0} photos or videos', mediaN) : '',
    prN: (w.prs && w.prs.length) || 0,
  }
}

// { key, iso, title, sub, icon }
export function dayNoteRowOf(iso, note) {
  return {
    key: 'note-' + iso,
    iso,
    title: note.tag ? t(DAY_NOTE_LABEL[note.tag]) : t('Day note'),
    sub: [fmtDate(iso, true), note.text].filter(Boolean).join(' · '),
    icon: note.tag ? DAY_NOTE_ICON[note.tag] : 'note',
  }
}
