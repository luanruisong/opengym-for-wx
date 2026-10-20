// <day-note-row row="{{row}}" /> — sheets.jsx DayNoteRow: a day off with a note (#261), listed
// between the workouts. A tap opens that day's note (dayNoteSheet). `row` from ../rows.js.
import { dayNoteSheet } from '../../../utils/sheets.js'

Component({
  options: { styleIsolation: 'apply-shared', virtualHost: true },
  properties: { row: { type: Object, value: {} } },
  methods: {
    onTap() { const r = this.properties.row; if (r && r.iso) dayNoteSheet(r.iso) },
  },
})
