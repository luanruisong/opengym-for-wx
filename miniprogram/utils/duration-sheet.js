// durationSheet({ title, value, min, max, off, footer, onDone }) — the wheel in a sheet of its own
// (frontend/src/components/DurationWheel.jsx durationSheet). Nothing is saved until Done: the page
// calls onDone(sec) with the clamped value and goes back. Lives in the main package so any page
// can import it; utils/sheets.js may re-export it.
import { openPage } from './nav.js'
import { REST_MAX } from '../lib/duration.js'

export function durationSheet({ title, value, min = 0, max = REST_MAX, off = null, footer = null, onDone } = {}) {
  return openPage('/pkg-common/duration/index', { title, value, min, max, off, footer, onDone })
}
