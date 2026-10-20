// <workout-media w="{{w}}" hint />  — the photos and videos of a saved workout (port of
// frontend/src/components/WorkoutMedia.jsx WorkoutMediaSection): a progress photo, a form-check
// clip. The grid of thumbnails with an Add tile; a tap previews (wx.previewMedia), a long press
// offers Remove. Files go through the same ingest and local store as a custom exercise's picture
// (lib/media-ingest.js, lib/media-store.js); the list on the record is edited by
// lib/workout-media.js. No server here: nothing to upload, so Add is always offered.
//
// properties
//   w     Object   the saved workout (any copy: it is matched in S.workouts with sameWorkout)
//   hint  Boolean  the finish screen's one-line explanation while there is nothing yet
import { connectComponent } from '../../../utils/page.js'
import { useStore } from '../../../store/store.js'
import { useUI } from '../../../store/ui.js'
import { confirmSheet } from '../../../utils/sheets.js'
import { t } from '../../../lib/i18n.js'
import { fmtNum } from '../../../lib/format.js'
import { workoutMediaOf, WORKOUT_MEDIA_MAX } from '../../../lib/media-refs.js'
import { addWorkoutMedia, removeWorkoutMedia } from '../../../lib/workout-media.js'
import { sameWorkout } from '../../../lib/workout-date.js'
import { mediaStore } from '../../../lib/media-store.js'
import { ingestMediaFile, storeIngested } from '../../../lib/media-ingest.js'

const toast = m => useUI.getState().toast(m)
const recordOf = (S, w) => (w && (S.workouts || []).find(x => x && sameWorkout(x, w))) || null

function mediaErrorText(e) {
  if (/ENOSPC|no space left|exceed/i.test(String((e && (e.errMsg || e.message)) || ''))) return t('There is no room left on this device for that file.')
  switch (e && e.code) {
    case 'type': return t('That file type isn’t supported. Use a photo, a GIF, or an MP4, MOV or WebM video.')
    case 'too-large': return t('That file is too big. Max {0} MB.', fmtNum(e.mb))
    case 'too-long': return t('That video is too long. Max {0} seconds.', e.sec)
    case 'photo-too-big': return t('That photo is too large to process on this device.')
    default: return t('This browser cannot read that file.')
  }
}

Component(connectComponent({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    w: { type: Object, value: null },
    hint: { type: Boolean, value: false },
  },
  data: { show: false, items: [], canAdd: false, full: false, busy: false, showHint: false },
  observers: {
    w() { if (this.__refresh) this.__refresh() },
  },
  mapState(S) {
    const rec = recordOf(S, this.properties.w)
    if (!rec) return { show: false, items: [] }
    const list = workoutMediaOf(rec)
    this.list = list
    const room = WORKOUT_MEDIA_MAX - list.length
    this.room = room
    // Thumbnails: the poster when there is one, else the file itself (a photo). Paths come from
    // the local store once its index is loaded.
    const items = list.map((m, i) => {
      const thumbHash = (m.poster && m.poster.hash) || (m.kind === 'image' || m.kind === 'gif' ? m.hash : null)
      return {
        hash: m.hash, i, video: m.kind === 'video',
        src: thumbHash ? mediaStore.pathNow(thumbHash) || '' : '',
      }
    })
    if (!this.storeReady) {
      this.storeReady = true
      mediaStore.ready().then(() => { if (this.__refresh) this.__refresh() }).catch(() => {})
    }
    return {
      show: true,
      items,
      canAdd: room > 0,
      full: room <= 0,
      showHint: this.properties.hint && !list.length,
    }
  },
  methods: {
    onAdd() {
      if (this.data.busy || !(this.room > 0)) return
      const w = this.properties.w
      wx.chooseMedia({
        count: Math.min(9, this.room),
        mediaType: ['image', 'video'],
        sourceType: ['album', 'camera'],
        success: r => { this.ingest(w, r.tempFiles || []) },
      })
    },
    async ingest(w, picked) {
      const now = recordOf(useStore.getState().S, w)
      const files = picked.slice(0, Math.max(0, WORKOUT_MEDIA_MAX - workoutMediaOf(now).length))
      let full = files.length < picked.length
      this.setData({ busy: true })
      try {
        for (const file of files) {
          let media
          try {
            media = await storeIngested(await ingestMediaFile(file))
          } catch (e) {
            toast(mediaErrorText(e))
            continue
          }
          let res
          useStore.getState().update(s => { res = addWorkoutMedia(s, w, media) })
          if (res === 'full') { full = true; break }
          if (res === 'gone') { toast(t('Workout deleted')); full = false; break }
        }
      } finally {
        this.setData({ busy: false })
      }
      if (full) toast(t('Up to {0} photos or videos per workout.', WORKOUT_MEDIA_MAX))
    },
    async onView(e) {
      const at = e.currentTarget.dataset.i
      const list = this.list || []
      const sources = []
      let current = 0
      for (let i = 0; i < list.length; i++) {
        const m = list[i]
        const url = await mediaStore.url(m.hash).catch(() => null)
        if (!url) continue
        if (i === at) current = sources.length
        const src = { url, type: m.kind === 'video' ? 'video' : 'image' }
        if (m.poster) { const p = mediaStore.pathNow(m.poster.hash); if (p) src.poster = p }
        sources.push(src)
      }
      if (!sources.length) return
      wx.previewMedia({ sources, current })
    },
    onRemove(e) {
      const hash = e.currentTarget.dataset.hash
      const w = this.properties.w
      confirmSheet({
        title: t('Remove this photo or video?'),
        confirmText: t('Remove'), danger: true,
        onConfirm: () => useStore.getState().update(s => { removeWorkoutMedia(s, w, hash) }),
      })
    },
  },
}))
