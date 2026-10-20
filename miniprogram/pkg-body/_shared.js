// Shared by the pkg-body pages (a subpackage cannot import another's code, so this lives here).
// The body-weight half is frontend/src/sheets.jsx (W_LO / wHi / bwMax / bwTooHeavy, WeighInRow);
// the media half is the picking part of components/CustomMediaField.jsx (useMediaPicker,
// mediaErrorText) on wx.chooseMedia.
import { useStore } from '../store/store.js'
import { useUI } from '../store/ui.js'
import { t } from '../lib/i18n.js'
import { fmtDate, fmtNum } from '../lib/format.js'
import { fmtMB } from './lib/media-limits.js'
import { ingestMediaFile, storeIngested } from './lib/media-ingest.js'
import { confirmSheet } from '../utils/sheets.js'

export const S = () => useStore.getState().S
export const update = (...a) => useStore.getState().update(...a)
export const toast = (m, o) => useUI.getState().toast(m, o)

/* ---------- body weight ---------- */

// The slider's range (WeightInput). A typed weight may sit past it, but not past bwMax.
export const W_LO = 1
export const wHi = unit => (unit === 'lb' ? 660 : 300)
export const bwMax = unit => (unit === 'lb' ? 1500 : 700)
export function bwTooHeavy(n, unit) {
  if (n <= bwMax(unit)) return false
  toast(t('That looks too heavy. Keep it at {0} or less.', fmtNum(bwMax(unit)) + ' ' + unit))
  return true
}

// One weigh-in row as the WXML draws it (WeighInRow).
export const weighInRow = (b, unit) => ({ d: b.d, date: fmtDate(b.d, true), w: fmtNum(b.w) + ' ' + unit })

// WeighInRow's delete: straight away in the log sheet's recent three, after a confirm in the
// full list (`confirm`), where a stray tap would take months-old history.
export function deleteWeighIn(d, confirm) {
  const st = S()
  const b = (st.bodyweight || []).find(x => x.d === d)
  if (!b) return
  const del = () => update(s => { s.bodyweight = s.bodyweight.filter(x => x.d !== d) })
  if (!confirm) { del(); return }
  confirmSheet({
    title: t('Delete weigh-in?'), message: `${fmtDate(b.d, true)} · ${fmtNum(b.w)} ${st.unit}`,
    confirmText: t('Delete'), danger: true, onConfirm: del,
  })
}

// Goes back from a sheet page (or to home when it is the only page).
export function goBack() {
  if (getCurrentPages().length > 1) wx.navigateBack()
  else wx.switchTab({ url: '/pages/home/index' })
}

/* ---------- media ---------- */

const noRoom = e => /ENOSPC|no space left|storage limit|exceed/i.test(String((e && (e.errMsg || e.message)) || ''))

// The sentence for a refused file (CustomMediaField.jsx mediaErrorText).
export function mediaErrorText(e) {
  if (noRoom(e)) return t('There is no room left on this device for that file.')
  switch (e && e.code) {
    case 'type': return t('That file type isn’t supported. Use a photo, a GIF, or an MP4, MOV or WebM video.')
    case 'too-large': return t('That file is too big. Max {0} MB.', fmtMB(e.mb))
    case 'too-long': return t('That video is too long. Max {0} seconds.', e.sec)
    case 'photo-too-big': return t('That photo is too large to process on this device.')
    default: return t('This browser cannot read that file.')
  }
}

// wx.chooseMedia for one photo (album or camera) → resolves the tempFiles entry, or null when
// the user backed out.
export function choosePhoto() {
  return new Promise(resolve => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['original', 'compressed'],
      success: r => resolve((r.tempFiles && r.tempFiles[0]) || null),
      fail: () => resolve(null),
    })
  })
}

// The picked file → the MediaRef the state keeps (re-encoded, hashed, with a poster) with its
// files put in the local store as pending; null after a toast saying why not (useMediaPicker.pick).
export async function ingestPicked(file) {
  if (!file) return null
  try {
    const out = await ingestMediaFile(file)
    return await storeIngested(out)
  } catch (e) {
    console.error('media', e)
    toast(mediaErrorText(e))
    return null
  }
}
