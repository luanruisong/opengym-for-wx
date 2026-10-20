// Add or edit a gym card (frontend/src/views/CheckIn.jsx CardSheet), opened from the check-in
// page. params: { card? } — without `card` a new one is created, with it that entry is updated
// in place. The code always comes from a scan or a photo (wx.scanCode, QR only); an edit that
// only renames keeps the scanned code untouched.
//
// The original scanned with the camera (mlkit / a browser camera sheet) and decoded an imported
// photo itself. Here both go through wx.scanCode: 扫描 opens the camera only, 导入照片 opens the
// same scanner with the album allowed (the mini program has no API that decodes a picked image).
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage } from '../../utils/nav.js'
import { uid } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { canRenderFmt } from '../checkin/qr.js'
import { S, update, toast, goBack } from '../_shared.js'

const fmtOf = scanType => (String(scanType || '').toUpperCase() === 'QR_CODE' ? 'qrcode' : String(scanType || ''))

Page(connectPage({
  data: { editing: false, label: '', value: '', busy: false },
  onLoad(query) {
    const p = pageParams(query)
    this.card = p.card || null
    this.setData({ editing: !!this.card, label: (this.card && this.card.label) || '', value: (this.card && this.card.value) || '' })
    wx.setNavigationBarTitle({ title: this.card ? t('Edit card') : t('Add a card') })
  },
  onUnload() { releasePage(this.query) },
  onLabel(e) { this.setData({ label: e.detail.value }) },
  scan(fromCamera) {
    if (this.data.busy) return
    this.setData({ busy: true })
    wx.scanCode({
      onlyFromCamera: fromCamera,
      scanType: ['qrCode'],
      success: r => {
        if (!canRenderFmt(fmtOf(r.scanType))) { toast(t("That's not a QR code. Only QR cards can be shown here")); return }
        const v = String(r.result || '')
        if (!v.trim()) { toast(t('No QR code found in that image')); return }
        this.setData({ value: v })
      },
      fail: err => {
        const m = String((err && err.errMsg) || '')
        if (/cancel/i.test(m)) return                    // user backed out
        if (/auth|permission|deny/i.test(m)) toast(t('Camera permission is needed to scan. Enable it in Settings.'))
        else toast(fromCamera ? t('Could not start the scanner') : t('Could not read that image'))
      },
      complete: () => this.setData({ busy: false }),
    })
  },
  onScan() { this.scan(true) },
  onImport() { this.scan(false) },
  onSave() {
    if (this.done) return
    const trimmed = this.data.value.trim()
    if (!trimmed) { toast(t('Scan or import a code first')); return }
    const label = this.data.label.trim() || t('Gym card')
    const card = this.card
    if (card) {
      if (!(S().gymCards || []).some(x => x.id === card.id)) {
        toast(t('That card was removed on another device'))
        this.done = true
        goBack()
        return
      }
      update(s => {
        const c = (s.gymCards || []).find(x => x.id === card.id)
        if (!c) return
        c.label = label
        c.value = trimmed
      })
      toast(t('Card updated'))
    } else {
      update(s => {
        if (!Array.isArray(s.gymCards)) s.gymCards = []
        const id = uid()
        s.gymCards.push({ id, label, value: trimmed, fmt: 'qrcode' })
        s.lastGymCardId = id
      })
      toast(t('Card added'))
    }
    this.done = true
    goBack()
  },
}))
