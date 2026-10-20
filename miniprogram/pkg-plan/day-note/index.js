// Why a day went without training (frontend/src/sheets.jsx DayNote, #261): a quick pick, a line
// of text, or both. Saving an empty note takes it away (lib/day-notes.js withDayNote stamps the
// clear), and so does Remove. params: { iso }.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage } from '../../utils/nav.js'
import { useStore } from '../../store/store.js'
import { useUI } from '../../store/ui.js'
import { dayNoteOf, withDayNote, DAY_NOTE_TAGS, DAY_NOTE_ICON, DAY_NOTE_LABEL } from '../../lib/day-notes.js'
import { NOTE_MAX } from '../../lib/history.js'
import { fmtDate } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'

Page(connectPage({
  data: { tags: [], tag: '', text: '', had: false, noteMax: NOTE_MAX },
  onLoad(query) {
    this.params = pageParams(query)
    const iso = this.params.iso
    if (!iso) { wx.navigateBack(); return }
    wx.setNavigationBarTitle({ title: fmtDate(iso, true) })
    const had = dayNoteOf(useStore.getState().S, iso)
    this.had = had
    this.text = (had && had.text) || ''
    this.setData({
      tags: DAY_NOTE_TAGS.map(k => ({ k, icon: DAY_NOTE_ICON[k], label: t(DAY_NOTE_LABEL[k]) })),
      tag: (had && had.tag) || '',
      text: this.text,
      had: !!had,
    })
  },
  onUnload() {
    releasePage(this.query)
  },
  onTag(e) {
    const k = e.currentTarget.dataset.k
    this.setData({ tag: this.data.tag === k ? '' : k })
  },
  onText(e) {
    this.text = e.detail.value
  },
  write(v) {
    const iso = this.params.iso
    useStore.getState().update(s => { s.dayNotes = withDayNote(s.dayNotes, iso, v) })
  },
  onSave() {
    if (this.done || !this.params || !this.params.iso) return
    this.done = true
    const tag = this.data.tag || null
    const clean = String(this.text || '').trim().slice(0, NOTE_MAX)
    if (!tag && !clean && !this.had) { wx.navigateBack(); return }
    this.write({ tag, text: clean })
    useUI.getState().toast(tag || clean ? t('Noted. See you next session!') : t('Note removed'))
    wx.navigateBack()
  },
  onRemove() {
    if (this.done || !this.params || !this.params.iso) return
    this.done = true
    this.write(null)
    useUI.getState().toast(t('Note removed'))
    wx.navigateBack()
  },
}))
