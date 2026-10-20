// Progress photos (frontend/src/views/ProgressPhotos.jsx; route /progress-photos): every still
// photo across every logged workout, newest first, grouped by date; a shortcut that adds one to
// today's logged workout (wx.chooseMedia → lib/media-ingest → the local media store →
// addWorkoutMedia, the same record the workout's own photo list writes); and a before/after
// comparison between any two (pkg-body/photo-compare).
//
// A photo opens in wx.previewImage (the original's full-screen viewer), swiping through all of
// them. Thumbnails show the 480 px poster when there is one.
import { connectPage } from '../../utils/page.js'
import { openPage, navTo } from '../../utils/nav.js'
import { fmtDate } from '../../lib/format.js'
import { t, tn } from '../../lib/i18n.js'
import { workoutMediaOf, WORKOUT_MEDIA_MAX } from '../../lib/media-refs.js'
import { addWorkoutMedia } from '../lib/workout-media.js'
import { mediaStore } from '../../lib/media-store.js'
import { S, update, toast, choosePhoto, ingestPicked } from '../_shared.js'
import { todaysWorkout, progressPhotosOf, groupByDate } from './photos.js'

const thumbHash = m => (m.poster && m.poster.hash) || m.hash

Page(connectPage({
  data: {
    count: '', n: 0, groups: [], comparing: false, ready: false, hint: '', canCompare: false,
    hasToday: false, busy: false, storable: true, resting: false,
  },
  mapState(st, { ui }) {
    const photos = progressPhotosOf(st)
    this.photos = photos
    const picked = this.picked || []
    const comparing = !!this.comparing
    return {
      resting: !!(ui.timer || ui.work),
      n: photos.length,
      count: tn('{0} photo', '{0} photos', photos.length),
      canCompare: photos.length >= 2,
      comparing,
      ready: picked.length === 2,
      hint: picked.length < 2 ? t('Pick two photos to compare.') : t('Ready! Open the comparison.'),
      hasToday: !!todaysWorkout(st),
      groups: groupByDate(photos).map(g => ({
        d: g.d,
        title: fmtDate(g.d, true, true),
        items: g.items.map(p => ({ key: p.key, src: mediaStore.pathNow(thumbHash(p.m)) || '', on: picked.includes(p.key) })),
      })),
    }
  },
  onLoad() {
    // pathNow answers null until the store's index has loaded; redraw once it has, and on every
    // change (a photo just added, a clean-up).
    mediaStore.ready()
      .then(() => { this.setData({ storable: mediaStore.persistent !== false }); this.__refresh && this.__refresh() })
      .catch(() => this.setData({ storable: false }))
    this.unsub = mediaStore.subscribe(() => this.__refresh && this.__refresh())
  },
  onUnload() { if (this.unsub) this.unsub() },

  onCompare() { this.comparing = true; this.picked = []; this.__refresh() },
  onCancelCompare() { this.comparing = false; this.picked = []; this.__refresh() },
  onPhoto(e) {
    const key = e.currentTarget.dataset.key
    const p = (this.photos || []).find(x => x.key === key)
    if (!p) return
    if (this.comparing) {
      const cur = this.picked || []
      this.picked = cur.includes(key) ? cur.filter(k => k !== key) : cur.length >= 2 ? [cur[1], key] : [...cur, key]
      this.__refresh()
      return
    }
    const urls = []
    let current = ''
    for (const x of this.photos) {
      const u = mediaStore.pathNow(x.m.hash) || mediaStore.pathNow(thumbHash(x.m))
      if (!u) continue
      if (!urls.includes(u)) urls.push(u)
      if (x.key === key) current = u
    }
    if (!current) return
    wx.previewImage({ urls, current })
  },
  onRunCompare() {
    const picked = this.picked || []
    if (picked.length !== 2) return
    const a = this.photos.find(p => p.key === picked[0])
    const b = this.photos.find(p => p.key === picked[1])
    this.comparing = false
    this.picked = []
    this.__refresh()
    if (!a || !b) return
    const [x, y] = a.d <= b.d ? [a, b] : [b, a]
    openPage('/pkg-body/photo-compare/index', { a: { d: x.d, m: x.m }, b: { d: y.d, m: y.m } })
  },
  onLogWorkout() { navTo('/workout') },
  async onAdd() {
    if (this.data.busy || !this.data.storable) return
    const today = todaysWorkout(S())
    if (!today) return
    if (workoutMediaOf(today).length >= WORKOUT_MEDIA_MAX) { toast(t('Up to {0} photos or videos per workout.', WORKOUT_MEDIA_MAX)); return }
    const file = await choosePhoto()
    if (!file) return
    this.setData({ busy: true })
    let got = null
    try { got = await ingestPicked(file) } finally { this.setData({ busy: false }) }
    if (!got) return
    let res
    update(s => { res = addWorkoutMedia(s, today, got) })
    if (res === 'added') toast(t('Photo added'))
    else if (res === 'full') toast(t('Up to {0} photos or videos per workout.', WORKOUT_MEDIA_MAX))
    else if (res === 'gone') toast(t('Workout deleted'))
  },
}))
