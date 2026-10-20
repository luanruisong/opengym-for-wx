// Shared by the measurement pages (frontend/src/views/Measurements.jsx module scope).
import { MEASUREMENT_FIELDS, measurementUnit, measurementValue, toMeasurementDisplay, normalizeMeasurementsState } from './lib/measurements.js'
import { useStore } from '../store/store.js'
import { openPage } from '../utils/nav.js'

// Every write leaves the list in its one-entry-per-day shape (normalizeMeasurementsState).
export const updateM = (fn, ...rest) => useStore.getState().update(s => { fn(s); normalizeMeasurementsState(s) }, ...rest)

export const fieldUnit = (field, profileUnit) => (field.key === 'bodyFat' ? '%' : measurementUnit(profileUnit))
export const shownValue = (entry, field, profileUnit) => {
  const value = measurementValue(entry, field.key)
  if (value == null) return null
  return field.key === 'bodyFat' ? value : toMeasurementDisplay(value, profileUnit)
}
export const GROUPS = [...new Set(MEASUREMENT_FIELDS.map(f => f.group))]

// measurementLogSheet / manageMeasurementsSheet as pages of their own.
export const openLog = (sourceDate = null) => openPage('/pkg-body/measurement-log/index', { sourceDate })
export const openManage = () => openPage('/pkg-body/measurement-fields/index', {})
