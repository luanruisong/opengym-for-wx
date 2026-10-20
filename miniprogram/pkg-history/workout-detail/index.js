// A saved workout (frontend/src/sheets.jsx WorkoutDetail), opened by utils/sheets.js
// workoutDetailSheet(w). params: { w }.
//
// The record shown is the one the store holds now (matched with sameWorkout, so a copy handed in
// by the opener, or one the date page re-keyed, still finds it); when it is gone (deleted here or
// elsewhere) the page goes back. The session note writes on blur and once more on the way out
// (onUnload), stamped like the original (stampWorkout) and only when it changed.
//
// Photos & videos (components/WorkoutMedia.jsx): the grid of the record's media from the local
// store, Add through wx.chooseMedia → media-ingest → media-store → lib/workout-media.js, a tap
// previews (wx.previewImage / wx.previewMedia), a long press removes.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage } from '../../utils/nav.js'
import { useStore } from '../../store/store.js'
import { useUI } from '../../store/ui.js'
import { confirmSheet, exerciseHistorySheet, workoutDateSheet, workoutDurationSheet } from '../../utils/sheets.js'
import { editSavedWorkout, deleteSavedWorkout, repeatWorkout, closeThenNav } from '../../store/actions.js'
import { EXIDX } from '../../lib/exercises.js'
import { t, exerciseNameFor } from '../../lib/i18n.js'
import { fmtDate, fmtNum, fmtVol, durPart } from '../../lib/format.js'
import { setLabel, sessionSections, workoutVolume, NOTE_MAX } from '../../lib/history.js'
import { hasCompletedWork, isWarmupRow } from '../../lib/workout-model.js'
import { speedUnitOf } from '../../lib/speed.js'
import { glyphOf } from '../../lib/glyphs.js'
import { sameWorkout } from '../../lib/workout-date.js'
import { stampWorkout } from '../../lib/sync-merge.js'
import { saveSessionAsRoutine } from '../../lib/session-routines.js'
import { copyText } from '../../lib/clipboard.js'
import { workoutText } from '../lib/workout-text.js'
import { workoutFit, fitFileName } from '../lib/fit-export.js'
import { workoutMediaOf, WORKOUT_MEDIA_MAX } from '../../lib/media-refs.js'
import { addWorkoutMedia, removeWorkoutMedia } from '../../lib/workout-media.js'
import { ingestMediaFile, storeIngested } from '../../lib/media-ingest.js'
import { mediaStore } from '../../lib/media-store.js'
import { fmtMB } from '../../lib/media-limits.js'

const toast = m => useUI.getState().toast(m)
const update = mut => useStore.getState().update(mut)
const nameOf = e => (EXIDX[e.id] ? exerciseNameFor(EXIDX[e.id]) : (e.n || e.id))

// The sentence for a refused file (CustomMediaField.jsx mediaErrorText).
function mediaErrorText(e) {
  const msg = String((e && (e.errMsg || e.message)) || '')
  if (/no space|storage|exceed|limit/i.test(msg) && !(e && e.code)) return t('There is no room left on this device for that file.')
  switch (e && e.code) {
    case 'type': return t('That file type isn’t supported. Use a photo, a GIF, or an MP4, MOV or WebM video.')
    case 'too-large': return t('That file is too big. Max {0} MB.', fmtMB(e.mb))
    case 'too-long': return t('That video is too long. Max {0} seconds.', e.sec)
    case 'photo-too-big': return t('That photo is too large to process on this device.')
    default: return t('This browser cannot read that file.')
  }
}

Page(connectPage({
  data: {
    found: false, meta: '', sections: [], grouped: false, note: '', noteMax: NOTE_MAX, active: false,
    media: [], showAdd: false, mediaFull: false, mediaBusy: false, mediaFullText: '',
  },

  onLoad(query) {
    const p = pageParams(query)
    this.w = p.w || null
    const rec = this.record()
    if (!rec) { this.leave(); return }
    this.w = rec
    this.noteText = rec.note || ''
    this.initialNote = rec.note || ''
    this.setData({ note: this.noteText })
    if (rec.name) wx.setNavigationBarTitle({ title: String(rec.name) })
    // The store's index of local files loads on first use; the thumbnails need it.
    try { mediaStore.ready().then(() => this.__refresh && this.__refresh(true)).catch(() => {}) } catch (e) { /* no store */ }
    this.__refresh && this.__refresh()
  },
  onShow() {
    // Back from the date or duration page after a change: this record moved, close as the original did.
    if (this.closeOnShow) { this.closeOnShow = false; this.leave() }
  },
  onUnload() {
    this.flushNote()
    releasePage(this.query)
  },

  record() {
    const w = this.w
    if (!w) return null
    return ((useStore.getState().S.workouts) || []).find(x => x && sameWorkout(x, w)) || null
  },
  leave() {
    if (this.leaving) return
    this.leaving = true
    if (getCurrentPages().length > 1) wx.navigateBack()
    else wx.switchTab({ url: '/pages/stats/index' })
  },
  close() { this.leave() },

  mapState(S) {
    if (!this.w) return {}
    const rec = (S.workouts || []).find(x => x && sameWorkout(x, this.w)) || null
    if (!rec) {
      if (this.__loaded) this.leave()
      return { found: false }
    }
    this.__loaded = true
    this.w = rec
    const w = rec
    const unit = S.unit
    const speedUnit = speedUnitOf(S)
    const entryRow = i => {
      const e = w.entries[i]
      return {
        i,
        name: nameOf(e),
        pr: !!(w.prs && w.prs.includes(e.id)),
        sets: e.sets.filter(hasCompletedWork).map(s => setLabel(e.id, s, e.target, speedUnit)).join('  ·  ') || t('no sets'),
        note: e.note || '',
        notePin: !!e.notePin,
      }
    }
    const unitsOf = units => units.map(unit => ({ key: 'u' + unit[0], ss: unit.length > 1, rows: unit.map(entryRow) }))
    const groups = sessionSections(w.entries)
    const grouped = groups.length > 1 || !!(groups[0] && groups[0].rid && (w.routineIds || []).length > 1)
    const sections = grouped ? groups.map(g => {
      const r = g.rid ? (S.routines || []).find(x => x.id === g.rid) : null
      const items = g.items.map(i => w.entries[i])
      const setN = items.reduce((n, e) => n + e.sets.filter(s => s.done && !isWarmupRow(s)).length, 0)
      return {
        key: g.rid || '__none',
        glyph: r ? glyphOf(r.emoji) : '',
        name: r ? r.name : t('Freestyle'),
        sub: t('{0} sets', setN) + ' · ' + fmtVol(workoutVolume({ entries: items }), unit),
        units: unitsOf(g.units),
      }
    }) : [{ key: '__flat', glyph: '', name: '', sub: '', units: unitsOf((groups[0] && groups[0].units) || []) }]

    // Media: posters in the grid (a photo without one shows itself), local files only.
    const list = workoutMediaOf(w)
    const pathOf = h => { try { return h ? mediaStore.pathNow(h) : null } catch (e) { return null } }
    const media = list.map((m, i) => ({
      hash: m.hash, i,
      src: pathOf((m.poster && m.poster.hash) || (m.kind === 'image' ? m.hash : null)) || (m.kind === 'image' ? pathOf(m.hash) : '') || '',
      video: m.kind !== 'image',
      label: t('Photo or video {0} of {1}', i + 1, list.length),
    }))
    const room = WORKOUT_MEDIA_MAX - list.length
    return {
      found: true,
      meta: [fmtDate(w.d, true), ...durPart((w.end || 0) - (w.start || 0)), fmtVol(w.vol, unit), ...(w.bw ? [fmtNum(w.bw) + ' ' + unit] : [])].join(' · '),
      grouped,
      sections,
      active: !!S.active,
      media,
      showAdd: room > 0,
      mediaFull: room <= 0,
      mediaFullText: t('Up to {0} photos or videos per workout.', WORKOUT_MEDIA_MAX),
    }
  },

  /* ---------- the session note ---------- */
  onNoteInput(e) { this.noteText = e.detail.value },
  saveNote() {
    const text = String(this.noteText || '').trim().slice(0, NOTE_MAX)
    const w = this.w
    if (!w) return
    update(s => {
      const rec = (s.workouts || []).find(x => sameWorkout(x, w))
      if (!rec) return
      if (text === (rec.note || '')) return
      if (text) rec.note = text; else delete rec.note
      stampWorkout(rec)
    })
    this.initialNote = text
  },
  onNoteBlur() { this.saveNote() },
  // The way out: the note as it stands, unless it is what the record started with or already has.
  flushNote() {
    const text = String(this.noteText || '').trim().slice(0, NOTE_MAX)
    if (text === this.initialNote || !this.record()) return
    const w = this.w
    update(s => {
      const rec = (s.workouts || []).find(x => sameWorkout(x, w))
      if (!rec || text === (rec.note || '')) return   // deleted from this very page, or already saved
      if (text) rec.note = text; else delete rec.note
      stampWorkout(rec)
    })
    this.initialNote = text
  },

  /* ---------- rows ---------- */
  onEntry(e) {
    const i = +e.currentTarget.dataset.i
    const en = this.w && this.w.entries[i]
    if (en) exerciseHistorySheet(en.id)
  },

  /* ---------- actions ---------- */
  onEdit() {
    if (this.data.active) return
    this.saveNote()
    editSavedWorkout(this.record() || this.w, () => this.close())
  },
  onRepeat() {
    if (this.data.active) return
    this.saveNote()
    repeatWorkout(this.record() || this.w, () => this.close())
  },
  onDate() {
    this.saveNote()
    workoutDateSheet(this.record() || this.w, () => { this.closeOnShow = true })
  },
  onDuration() {
    this.saveNote()
    workoutDurationSheet(this.record() || this.w, () => { this.closeOnShow = true })
  },
  onSaveRoutine() {
    confirmSheet({
      title: t('Save as routine?'),
      message: t('Create an independent routine from these exercise targets. Your workout history is kept.'),
      confirmText: t('Save'),
      onConfirm: () => {
        const w = this.record() || this.w
        let id
        try { update(s => { id = saveSessionAsRoutine(s, w, w.name) }) }
        catch (e) { toast(t(e.message)); return }
        closeThenNav(() => this.close(), '/plan/r/' + id)
      },
    })
  },
  // Copied with the note as it stands in the box, which may not be saved yet.
  onCopy() {
    const S = useStore.getState().S
    const rec = Object.assign({}, this.record() || this.w, { note: String(this.noteText || '').trim() })
    copyText(workoutText(rec, { unit: S.unit, nameOf, speedUnit: speedUnitOf(S) }))
      .then(ok => toast(ok ? t('Copied') : t('Could not copy')))
      .catch(() => toast(t('Could not copy')))
  },
  // A Garmin .fit activity (#447) of the saved record, handed to a chat (Garmin Connect's Import
  // Data takes it from there). wx.shareFileMessage needs the tap's user gesture: no await before it.
  onFit() {
    const S = useStore.getState().S
    const rec = this.record() || this.w
    let path, name
    try {
      const bytes = workoutFit(rec, { unit: S.unit, version: '' })
      name = fitFileName(rec)
      path = wx.env.USER_DATA_PATH + '/' + name
      const buf = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer
      wx.getFileSystemManager().writeFileSync(path, buf)
    } catch (e) { toast(t('Could not create the file')); return }
    wx.shareFileMessage({ filePath: path, fileName: name, fail: () => {} })
  },
  onDelete() {
    const w = this.record() || this.w
    deleteSavedWorkout(w, () => this.leave())
  },

  /* ---------- photos & videos ---------- */
  onMediaTap(e) {
    const i = +e.currentTarget.dataset.i
    const list = workoutMediaOf(this.record())
    const m = list[i]
    if (!m) return
    const path = h => { try { return mediaStore.pathNow(h) } catch (err) { return null } }
    if (m.kind === 'image') {
      const urls = list.filter(x => x.kind === 'image').map(x => path(x.hash)).filter(Boolean)
      const cur = path(m.hash)
      if (!cur) { toast(t('This browser cannot read that file.')); return }
      wx.previewImage({ urls, current: cur })
      return
    }
    const url = path(m.hash)
    if (!url) { toast(t('This browser cannot read that file.')); return }
    const poster = m.poster ? path(m.poster.hash) : null
    wx.previewMedia({ sources: [Object.assign({ url, type: 'video' }, poster ? { poster } : {})] })
  },
  onMediaLong(e) {
    const hash = e.currentTarget.dataset.hash
    if (!hash) return
    confirmSheet({
      title: t('Remove this photo or video?'),
      confirmText: t('Remove'),
      danger: true,
      onConfirm: () => { const w = this.w; update(s => { removeWorkoutMedia(s, w, hash) }) },
    })
  },
  onMediaAdd() {
    if (this.data.mediaBusy) return
    const now = this.record()
    if (!now) return
    const room = Math.max(0, WORKOUT_MEDIA_MAX - workoutMediaOf(now).length)
    if (!room) { toast(t('Up to {0} photos or videos per workout.', WORKOUT_MEDIA_MAX)); return }
    wx.chooseMedia({
      count: room,
      mediaType: ['image', 'video'],
      sourceType: ['album', 'camera'],
      success: res => this.addFiles(res.tempFiles || [], room),
      fail: () => {},
    })
  },
  async addFiles(picked, room) {
    const files = picked.slice(0, room)
    let full = files.length < picked.length
    this.setData({ mediaBusy: true })
    try {
      for (const file of files) {
        let ref
        try { ref = await storeIngested(await ingestMediaFile(file)) }
        catch (e) { toast(mediaErrorText(e)); continue }
        const w = this.w
        let res
        update(s => { res = addWorkoutMedia(s, w, ref) })
        if (res === 'full') { full = true; break }
        if (res === 'gone') { toast(t('Workout deleted')); full = false; break }
      }
    } finally {
      this.setData({ mediaBusy: false })
    }
    if (full) toast(t('Up to {0} photos or videos per workout.', WORKOUT_MEDIA_MAX))
  },
}))
