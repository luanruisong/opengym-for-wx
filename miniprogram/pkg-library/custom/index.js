// Create or edit a custom exercise (frontend/src/sheets.jsx CustomExForm + components/
// CustomMediaField.jsx), opened by utils/sheets.js#customExSheet(existing, onDone, prefill).
//
// params: existing  the custom exercise to edit, or null for a new one
//         onDone    called with the saved exercise (EXIDX entry) — after this page went back, so
//                   an onDone that opens another page (the detail, the config) opens it from the
//                   page below; callers that use store/actions.js afterSheet work either way
//         prefill   the name to start a new one with (what was typed in the search)
//
// Name + body part + equipment is all it takes. A photo, GIF or video of your own goes through
// wx.chooseMedia → lib/media-ingest.js (re-encoded / scrubbed, hashed, poster) into the local
// media store as soon as it is picked; the state keeps only the small reference, written on Save.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage } from '../../utils/nav.js'
import { useStore } from '../../store/store.js'
import { useUI } from '../../store/ui.js'
import { deleteCustomEx } from '../../store/actions.js'
import { EXIDX, BODYPARTS, allExercises } from '../../lib/exercises.js'
import { ALL_EQUIPMENT } from '../../lib/equipment.js'
import { uid } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { MUSCLES, MUSCLE_NAME, normalizeMuscleGroups, hasExplicitMuscleMetadata, inMuscleOrder } from '../../lib/muscles.js'
import { mediaOf, normalizeMediaRef, cleanUrl, fmtClip } from '../../lib/media-refs.js'
import { mediaStore } from '../../lib/media-store.js'
import { fmtMB, MB } from '../lib/media-limits.js'
import { ingestMediaFile, storeIngested } from '../lib/media-ingest.js'
import { backThen } from '../sheet-finish.js'

const getS = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const toast = m => useUI.getState().toast(m)

// A write the file system refused for room: the file itself was fine.
const noRoom = e => /ENOSPC|no space left|exceeded|storage limit/i.test(String((e && (e.errMsg || e.message)) || ''))

// The sentence for a refused file (MediaError codes from lib/media-ingest.js).
function mediaErrorText(e) {
  if (noRoom(e)) return t('There is no room left on this device for that file.')
  switch (e && e.code) {
    case 'type': return t('That file type isn’t supported. Use a photo, a GIF, or an MP4, MOV or WebM video.')
    case 'too-large': return t('That file is too big. Max {0} MB.', fmtMB(e.mb))
    case 'too-long': return t('That video is too long. Max {0} seconds.', e.sec)
    case 'photo-too-big': return t('That photo is too large to process on this device.')
    default: return t('This browser cannot read that file.').replace('此浏览器', '此设备')
  }
}

const chooseOne = () => new Promise(resolve => {
  wx.chooseMedia({
    count: 1,
    mediaType: ['image', 'video'],
    sourceType: ['album', 'camera'],
    sizeType: ['original'],
    success: r => resolve((r.tempFiles && r.tempFiles[0]) || null),
    fail: () => resolve(null),
  })
})

Page(connectPage({
  data: {
    editing: false,
    n: '',
    bp: '',
    eq: '',
    desc: '',
    url: '',
    bpChips: [],
    eqChips: [],
    showMuscles: false,
    showPrimary: false,
    cardio: false,
    primarySum: '',
    secondarySum: '',
    // the media field
    mThumb: '',
    mHas: false,
    mSub: '',
    mKindIcon: 'image',
    busy: false,
    warning: '',
    // the muscle multi-select sheet
    msOpen: false,
    msTitle: '',
    msOpts: [],
  },

  mapState() { return {} },

  onLoad(query) {
    const p = pageParams(query)
    this.params = p
    const existing = p.existing || null
    this.existing = existing
    const storedEq = existing && typeof existing.eq === 'string' && existing.eq && !ALL_EQUIPMENT.includes(existing.eq) ? existing.eq : null
    const f = {
      n: existing ? existing.n : (p.prefill || ''),
      bp: existing ? existing.bp : '',
      eq: existing ? (existing.eq || '') : '',
      desc: existing ? (existing.desc || '') : '',
      url: existing && typeof existing.url === 'string' ? existing.url : '',
      media: mediaOf(existing),
      mediaTouched: false,
      primaries: [],
      secondaries: [],
      primaryTaps: [],
    }
    if (existing && Array.isArray(existing.primaries) && existing.primaries.length) {
      f.primaries = [...existing.primaries]
      f.secondaries = [...(existing.secondaries || [])]
    } else {
      const norm = hasExplicitMuscleMetadata(existing || {}) ? normalizeMuscleGroups(existing || {}) : []
      f.primaries = existing && existing.bp === 'cardio' ? ['cardiovascular system'] : (norm.length ? [norm[0]] : [])
      f.secondaries = norm.slice(1)
    }
    this.f = f
    this.storedEq = storedEq
    const eqs = ALL_EQUIPMENT.slice()
    if (storedEq) eqs.push(storedEq)
    wx.setNavigationBarTitle({ title: existing ? t('Edit custom exercise') : t('Create your own exercise') })
    this.setData({
      editing: !!existing,
      n: f.n, bp: f.bp, eq: f.eq, desc: f.desc, url: f.url,
      bpChips: BODYPARTS.map(b => ({ v: b, label: t(b) })),
      eqChips: eqs.map(k => ({ v: k, label: t(k) })),
    })
    this.holdMedia()
    this.paint()
    if (f.media) mediaStore.ready().then(() => this.paint()).catch(() => {})
  },
  onUnload() {
    if (this.release) this.release()
    releasePage(this.query)
  },

  // Everything that follows from the form's own state.
  paint() {
    const f = this.f
    const label = m => t(MUSCLE_NAME[m] || m)
    const sum = list => {
      const sel = MUSCLES.filter(m => list.includes(m))
      return sel.length ? sel.map(label).join(', ') : t('No explicit muscle group')
    }
    const m = f.media
    let thumb = ''
    if (m) {
      const h = m.kind === 'video' ? (m.poster && m.poster.hash) : ((m.poster && m.poster.hash) || m.hash)
      try { thumb = (h && mediaStore.pathNow(h)) || '' } catch (e) { thumb = '' }
    }
    const sizeLine = m ? [m.dur != null && m.kind !== 'image' ? fmtClip(m.dur) : null,
      t('{0} MB', fmtMB(Math.max(0.1, m.size / MB), { fixed: true }))].filter(Boolean).join(' · ') : ''
    this.setData({
      showMuscles: !!f.bp,
      showPrimary: !!f.bp && f.bp !== 'cardio',
      cardio: f.bp === 'cardio',
      primarySum: sum(f.primaries),
      secondarySum: sum(f.secondaries),
      mHas: !!m,
      mThumb: thumb,
      mKindIcon: m && m.kind !== 'image' ? 'play' : 'image',
      mSub: m ? sizeLine : t('Optional. A picture makes it easier to spot in a list.'),
    })
  },

  // The draft's files stay out of the store's clean-up for as long as the form is open.
  holdMedia() {
    if (this.release) { this.release(); this.release = null }
    const m = this.f.media
    if (m && m.hash) {
      try { this.release = mediaStore.hold([m.hash, m.poster && m.poster.hash]) } catch (e) { this.release = null }
    }
  },

  /* ---------- fields ---------- */
  onName(e) { this.f.n = e.detail.value },
  onDesc(e) { this.f.desc = e.detail.value },
  onUrl(e) { this.f.url = e.detail.value },
  onBp(e) {
    this.f.bp = e.currentTarget.dataset.v
    this.setData({ bp: this.f.bp })
    this.paint()
  },
  onEq(e) {
    this.f.eq = e.currentTarget.dataset.v
    this.setData({ eq: this.f.eq })
  },

  /* ---------- muscle groups (MultiSelectRow → an in-page sheet) ---------- */
  openMuscles(which) {
    this.ms = which
    this.setData({
      msOpen: true,
      msTitle: which === 'p' ? t('Primary muscle groups') : t('Additional muscle groups'),
      msOpts: this.msOptions(),
    })
  },
  msOptions() {
    const f = this.f
    const list = this.ms === 'p' ? f.primaries : f.secondaries
    // The extra muscles leave out what is already a primary (as the sheet was opened).
    const opts = this.ms === 'p' ? MUSCLES : MUSCLES.filter(m => !f.primaries.includes(m))
    return opts.map(m => ({ v: m, label: t(MUSCLE_NAME[m]), on: list.includes(m) }))
  },
  onPrimary() { this.openMuscles('p') },
  onSecondary() { this.openMuscles('s') },
  onMsToggle(e) {
    const v = e.currentTarget.dataset.v
    const f = this.f
    if (this.ms === 'p') {
      f.primaryTaps.push(v)
      f.primaries = f.primaries.includes(v) ? f.primaries.filter(m => m !== v) : [...f.primaries, v]
    } else {
      f.secondaries = f.secondaries.includes(v) ? f.secondaries.filter(m => m !== v) : [...f.secondaries, v]
    }
    const i = this.data.msOpts.findIndex(o => o.v === v)
    if (i >= 0) this.setData({ ['msOpts[' + i + '].on']: !this.data.msOpts[i].on })
    this.paint()
  },
  onMsClose() { this.setData({ msOpen: false }) },

  /* ---------- the picture ---------- */
  async onPickMedia() {
    if (this.data.busy) return
    const file = await chooseOne()
    if (!file) return
    this.setData({ busy: true, warning: '' })
    try {
      const out = await ingestMediaFile(file)
      const ref = await storeIngested(out)
      if (out.warnings && out.warnings.includes('codec')) this.setData({ warning: t('This video may not play on every device. MP4 (H.264) plays everywhere.') })
      this.f.media = ref
      this.f.mediaTouched = true
      this.holdMedia()
    } catch (e) {
      console.error(e)
      toast(mediaErrorText(e))
    }
    this.setData({ busy: false })
    this.paint()
  },
  onRemoveMedia() {
    if (this.data.busy) return
    this.f.media = null
    this.f.mediaTouched = true
    this.setData({ warning: '' })
    this.holdMedia()
    this.paint()
  },
  onPreview() {
    const src = this.data.mThumb
    if (src && this.f.media && this.f.media.kind !== 'video') wx.previewImage({ urls: [src], current: src })
  },

  /* ---------- save / delete ---------- */
  onSave() {
    if (this.done) return
    const f = this.f
    const existing = this.existing
    const name = String(f.n || '').trim()
    if (!name) { toast(t('Give it a name')); return }
    if (!f.bp) { toast(t('Pick a body part')); return }
    if (!f.eq) { toast(t('Pick equipment')); return }
    // A kept name is no duplicate even when the catalogue spells one the same way.
    const renamed = !existing || name.toLowerCase() !== String(existing.n || '').trim().toLowerCase()
    const dup = renamed && allExercises(getS()).find(e => e.n.toLowerCase() === name.toLowerCase() && e.id !== (existing || {}).id)
    if (dup) { toast(t('“{0}” already exists', dup.n)); return }
    const d = String(f.desc || '').trim().slice(0, 1000)
    // An empty field removes the link; anything else has to be a web address.
    const rawUrl = String(f.url || '')
    const link = rawUrl.trim() ? cleanUrl(rawUrl) : null
    if (rawUrl.trim() && !link) { toast(t('That link is not a web address')); return }
    // An edit that did not touch the picture writes back what the exercise had, byte for byte.
    const keepMedia = !!existing && !f.mediaTouched
    const ref = keepMedia ? null : normalizeMediaRef(f.media)
    const bp = f.bp
    const eq = f.eq
    const prim = bp === 'cardio' ? ['cardiovascular system'] : inMuscleOrder(f.primaries)
    const sm = inMuscleOrder(f.secondaries.filter(m => !prim.includes(m)))
    const groups = [...prim, ...sm]
    // The one-word target: the exercise's own while it is still a primary, else the first primary
    // tapped here that survived, else the sorted list's head.
    const tg = (existing && prim.includes(existing.tg)) ? existing.tg : (f.primaryTaps.find(m => prim.includes(m)) || prim[0] || '')
    let id = existing && existing.id
    const extra = c => {
      if (!keepMedia) { if (ref) c.media = ref; else delete c.media }
      if (link) c.url = link; else delete c.url
    }
    if (existing) {
      update(s => {
        const c = (s.customEx || []).find(x => x.id === id)
        if (c) {
          c.n = name; c.bp = bp; c.desc = d; c.tg = tg; c.sm = sm; c.muscleGroups = groups; c.primaries = prim; c.secondaries = sm; c.eq = eq
          extra(c)
        }
      })
    } else {
      id = 'c' + uid()
      update(s => {
        const c = { id, n: name, bp, desc: d, tg, sm, muscleGroups: groups, primaries: prim, secondaries: sm, eq, custom: true }
        extra(c)
        ;(s.customEx = s.customEx || []).push(c)
      })
    }
    this.done = true
    toast(existing ? t('Saved') : t('“{0}” created', name))
    const onDone = this.params.onDone
    const saved = EXIDX[id]
    backThen(this, () => { if (typeof onDone === 'function') onDone(saved) })
  },
  onDelete() {
    const existing = this.existing
    if (!existing) return
    backThen(this, () => deleteCustomEx(existing))
  },
}))
