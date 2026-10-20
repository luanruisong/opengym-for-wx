// Exercise-list plumbing shared by the Library tab (this page) and the pkg-library pages (the
// exercise picker, the detail, the custom form). It lives in the main package so both can import
// it: a subpackage may import from the main package, never from another subpackage.
//
// What the web app rendered from each exercise (Library.jsx row, sheets.jsx pickRow) is worked
// out here into a flat row object; WXML cannot call functions. The full filtered list stays in
// JS and only the rows on screen go through setData, BATCH at a time (1300+ exercises).
import { t, exerciseNameFor, exerciseNameClass } from '../../lib/i18n.js'
import { MUSCLE_NAME } from '../../lib/muscles.js'
import { isFav } from '../../lib/favourites.js'
import { isCustomEx, EXIDX, BODYPARTS, allExercises, exOr } from '../../lib/exercises.js'
import { mediaOf } from '../../lib/media-refs.js'
import { mediaStore } from '../../lib/media-store.js'

export const BATCH = 50

// The first character of the name shown, in place of the catalogue picture this build does not
// ship (ARCHITECTURE: no exercise media). Array.from keeps a CJK character or an emoji whole.
export function initialOf(name) {
  const s = String(name || '').trim()
  if (!s) return '?'
  return Array.from(s)[0].toUpperCase()
}

// The picture of a custom exercise, when the user gave it one and the file is on this device:
// the photo or GIF itself, a video's poster. '' otherwise (the initial shows).
export function thumbSrc(ex) {
  if (!isCustomEx(ex)) return ''
  const m = mediaOf(ex)
  if (!m) return ''
  const hash = m.kind === 'video' ? (m.poster && m.poster.hash) : ((m.poster && m.poster.hash) || m.hash)
  if (!hash) return ''
  try { return mediaStore.pathNow(hash) || '' } catch (e) { return '' }
}

// Whether any custom exercise has a picture: the page then waits for the media index to load
// (pathNow answers null before it has) and redraws once.
export const anyCustomMedia = S => (S.customEx || []).some(c => c && c.media)

// One list row: { id, name, cap, sub, fav, ch, img } plus whatever `extra` adds.
export function exRow(S, e, extra) {
  const name = exerciseNameFor(e)
  const row = {
    id: e.id,
    name,
    cap: exerciseNameClass(e) === 'capitalize',
    sub: t(MUSCLE_NAME[e.tg] || e.tg || e.bp) + ' · ' + t(e.eq),
    fav: isFav(S, e.id),
    ch: initialOf(name),
    img: thumbSrc(e),
  }
  return extra ? Object.assign(row, extra) : row
}

// The exercise behind a row id: the index first (catalogue and registered customs), then the
// state's own list, then the stand-in exOr builds for an id nobody knows.
export function exById(S, id) {
  return EXIDX[id] || allExercises(S).find(e => e.id === id) || exOr(id)
}

// Chip rows: [{ v, label }]; the page marks the one on with `v === current` in WXML.
export const bodypartChips = () => BODYPARTS.map(b => ({ v: b, label: t(b) }))
export const labelChips = list => list.map(x => ({ v: x, label: t(x) }))

// A trailing-edge debounce (the search field: filter ~150 ms after the last keystroke).
export function debounce(fn, ms = 150) {
  let tm = null
  const d = function (...args) {
    clearTimeout(tm)
    tm = setTimeout(() => { tm = null; fn.apply(this, args) }, ms)
  }
  d.cancel = () => { clearTimeout(tm); tm = null }
  return d
}

// Paged rendering of a long list into data[key]. `reset(all, make)` keeps the whole list in JS
// and renders the first batch; `more()` appends the next batch with path updates (key[i]), so a
// load-more costs one batch of rows and not the whole list again; `refresh()` re-makes the rows
// already shown (a favourite toggled, a name changed). Returns the patch so the caller can merge
// its own keys into the same setData.
export function createPager(page, key, batch = BATCH) {
  const p = {
    all: [],
    make: x => x,
    shown: 0,
    get total() { return p.all.length },
    get hasMore() { return p.shown < p.all.length },
    reset(all, make, keepShown = false, patch = {}) {
      p.all = all || []
      if (make) p.make = make
      const n = Math.min(p.all.length, keepShown ? Math.max(batch, p.shown) : batch)
      p.shown = n
      patch[key] = p.all.slice(0, n).map(p.make)
      return patch
    },
    more(patch = {}) {
      const from = p.shown
      const to = Math.min(p.all.length, from + batch)
      for (let i = from; i < to; i++) patch[key + '[' + i + ']'] = p.make(p.all[i])
      p.shown = to
      return patch
    },
    refresh(patch = {}) { return p.reset(p.all, null, true, patch) },
  }
  return p
}

// The top page of the stack (or null).
export function topPage() {
  try {
    const ps = getCurrentPages()
    return ps[ps.length - 1] || null
  } catch (e) { return null }
}
