// Body measurements (frontend/src/views/Measurements.jsx; route /measurements): the selected
// measurement's latest value, change since the previous check-in and its curve over a range,
// then every check-in newest first with edit / delete. Logging and choosing the fields are
// pages of their own (measurement-log, measurement-fields).
import { connectPage } from '../../utils/page.js'
import { confirmSheet } from '../../utils/sheets.js'
import {
  MEASUREMENT_FIELDS, MEASUREMENT_KEYS, enabledMeasurementFields, latestMeasurement,
  measurementSeries, measurementUnit,
} from '../lib/measurements.js'
import { fmtDate, fmtNum } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { toast } from '../_shared.js'
import { updateM, fieldUnit, shownValue, openLog, openManage } from '../measure.js'

const RANGES = [{ value: 30, label: '1M' }, { value: 90, label: '3M' }, { value: 365, label: '1Y' }, { value: 0, label: 'All' }]

function availableFields(S) {
  const out = enabledMeasurementFields(S)
  for (const field of MEASUREMENT_FIELDS) {
    if (latestMeasurement(S, field.key) && !out.some(f => f.key === field.key)) out.push(field)
  }
  for (const custom of S.customMeasurements || []) {
    const key = 'other:' + custom.id
    if (latestMeasurement(S, key) && !out.some(f => f.key === key)) out.push({ key, label: custom.name, custom: true, group: 'Other' })
  }
  return out
}

Page(connectPage({
  data: {
    ranges: [], range: 90, has: false, title: '', latest: '–', unit: 'cm', delta: '',
    optLabels: [], selIdx: 0, selLabel: '', points: [], recent: [],
  },
  mapState(S) {
    const range = this.range == null ? 90 : this.range
    const available = availableFields(S)
    const waist = available.find(f => f.key === 'waist')
    const fallback = (waist && waist.key) || (available[0] && available[0].key) || null
    const key = available.some(f => f.key === this.selected) ? this.selected : fallback
    const field = available.find(f => f.key === key)
    const unit = key === 'bodyFat' ? '%' : measurementUnit(S.unit)
    const all = key ? measurementSeries(S, key) : []
    const latest = all[all.length - 1]
    const previous = all[all.length - 2]
    const delta = latest && previous ? Math.round((latest.y - previous.y) * 10) / 10 : null
    const enabled = enabledMeasurementFields(S)
    this.keys = available.map(f => f.key)
    return {
      ranges: RANGES.map(r => ({ value: r.value, label: r.value ? r.label : t('All') })),
      range,
      has: available.length > 0,
      title: field ? (field.custom ? field.label : t(field.label)) : t('Body measurements'),
      latest: latest ? fmtNum(latest.y) : '–',
      hasLatest: !!latest,
      unit,
      delta: delta != null && delta !== 0 ? (delta > 0 ? '+' : '') + fmtNum(delta) + ' ' + unit + ' ' + t('since previous') : '',
      optLabels: available.map(f => (f.custom ? f.label : t(f.label))),
      selIdx: Math.max(0, available.findIndex(f => f.key === key)),
      selLabel: field ? (field.custom ? field.label : t(field.label)) : '',
      points: key ? measurementSeries(S, key, range) : [],
      recent: [...S.measurements].reverse().map(entry => {
        const count = MEASUREMENT_KEYS.filter(k => entry[k] != null).length + (entry.other || []).filter(o => o.value != null).length
        const preview = enabled.map(f => ({ f, value: shownValue(entry, f, S.unit) })).filter(x => x.value != null).slice(0, 3)
        return {
          d: entry.d,
          date: fmtDate(entry.d, true),
          count: t(count === 1 ? '{0} measurement' : '{0} measurements', count),
          preview: preview.map(({ f, value }) => ({ key: f.key, label: f.custom ? f.label : t(f.label), v: fmtNum(value) + ' ' + fieldUnit(f, S.unit) })),
        }
      }),
    }
  },
  onRange(e) { this.range = e.detail.value; this.__refresh() },
  onPick(e) {
    const k = this.keys && this.keys[Number(e.detail.value)]
    if (k) { this.selected = k; this.__refresh() }
  },
  onLog() { openLog() },
  onManage() { openManage() },
  onEdit(e) { openLog(e.currentTarget.dataset.d) },
  onDelete(e) {
    const d = e.currentTarget.dataset.d
    confirmSheet({
      title: t('Delete measurements?'),
      message: t('Deletes the measurements logged on {0}.', fmtDate(d, true)),
      confirmText: t('Delete'), danger: true,
      onConfirm: () => { updateM(state => { state.measurements = state.measurements.filter(x => x.d !== d) }); toast(t('Measurements deleted')) },
    })
  },
}))
