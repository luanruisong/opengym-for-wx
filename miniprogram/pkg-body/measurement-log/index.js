// Log or edit one day's measurements (frontend/src/views/Measurements.jsx MeasurementLog).
// params: { sourceDate } — null logs a new check-in, a date edits that day's. Editing shows
// every populated field even if it was switched off after logging.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage } from '../../utils/nav.js'
import {
  MEASUREMENT_FIELDS, emptyMeasurement, enabledMeasurementFields, fromMeasurementDisplay,
  measurementEntryHasValues, normalizeMeasurementEntry,
} from '../lib/measurements.js'
import { todayISO } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { S, toast, goBack } from '../_shared.js'
import { updateM, fieldUnit, shownValue } from '../measure.js'

Page(connectPage({
  data: { editing: false, date: '', today: '', fields: [] },
  onLoad(query) {
    const p = pageParams(query)
    const st = S()
    this.sourceDate = p.sourceDate || null
    const source = this.sourceDate ? st.measurements.find(e => e.d === this.sourceDate) : null
    const fields = [...enabledMeasurementFields(st)]
    if (source) {
      for (const f of MEASUREMENT_FIELDS) {
        if (source[f.key] != null && !fields.some(x => x.key === f.key)) fields.push(f)
      }
      for (const o of source.other || []) {
        if (o.value != null && !fields.some(x => x.key === 'other:' + o.id)) {
          fields.push({ key: 'other:' + o.id, label: o.name, custom: true, group: 'Other' })
        }
      }
    }
    this.source = source
    this.fields = fields
    this.values = {}
    for (const f of fields) this.values[f.key] = shownValue(source, f, st.unit)
    this.setData({
      editing: !!source,
      date: (source && source.d) || todayISO(),
      today: todayISO(),
      fields: fields.map(f => ({ key: f.key, label: f.custom ? f.label : t(f.label), unit: fieldUnit(f, st.unit), shown: this.values[f.key] == null ? '' : String(this.values[f.key]) })),
    })
    wx.setNavigationBarTitle({ title: source ? t('Edit measurements') : t('Log measurements') })
  },
  onUnload() { releasePage(this.query) },
  onDate(e) { this.setData({ date: e.detail.value }) },
  // A plain digit input (a typed "," counts as the decimal mark, as NumberField's): empty is null.
  onValue(e) {
    const s = String(e.detail.value || '').replace(/,/g, '.').replace(/[^0-9.]/g, '')
    const n = s === '' || s === '.' ? null : parseFloat(s)
    this.values[e.currentTarget.dataset.key] = Number.isFinite(n) ? n : null
  },
  onCancel() { goBack() },
  onSave() {
    if (this.done) return
    const st = S()
    const date = this.data.date
    const sourceDate = this.sourceDate
    const source = this.source
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayISO()) { toast(t('Choose a valid date')); return }
    if (date !== sourceDate && st.measurements.some(e => e.d === date)) {
      toast(t('That date already has measurements. Edit it instead.')); return
    }
    const base = source ? normalizeMeasurementEntry(source, st.customMeasurements) : emptyMeasurement(date, st.customMeasurements)
    base.d = date
    for (const field of this.fields) {
      const raw = this.values[field.key]
      const value = raw == null || raw === 0 ? null : Math.round(+raw * 10) / 10
      if (field.key === 'bodyFat' && value > 100) { toast(t('Body fat must be between 0 and 100%.')); return }
      if (field.custom) {
        const item = base.other.find(o => o.id === field.key.slice(6))
        if (item) item.value = value == null ? null : fromMeasurementDisplay(value, st.unit)
      } else if (field.key === 'bodyFat') base.bodyFat = value
      else base[field.key] = value == null ? null : fromMeasurementDisplay(value, st.unit)
    }
    if (!measurementEntryHasValues(base)) { toast(t('Enter at least one measurement')); return }
    // `t` is when the check-in was last saved (the newer one of a day wins a merge).
    base.t = Date.now()
    this.done = true
    updateM(state => {
      if (sourceDate) state.measurements = state.measurements.filter(e => e.d !== sourceDate)
      state.measurements.push(base)
    })
    toast(t('Measurements saved'))
    goBack()
  },
}))
