// Choose measurements (frontend/src/views/Measurements.jsx ManageMeasurements): built-in fields
// on/off by group, the custom ones under Other, and a field to add a custom measurement.
// Every toggle saves at once; 完成 just goes back.
import { connectPage } from '../../utils/page.js'
import { releasePage } from '../../utils/nav.js'
import { MEASUREMENT_FIELDS } from '../lib/measurements.js'
import { uid } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { S, toast, goBack } from '../_shared.js'
import { updateM, GROUPS } from '../measure.js'

Page(connectPage({
  data: { groups: [], name: '' },
  mapState(st) {
    const on = new Set(st.measurementEnabled || [])
    return {
      groups: GROUPS.map(group => ({
        group,
        title: t(group),
        rows: MEASUREMENT_FIELDS.filter(f => f.group === group).map(f => ({ id: 'b:' + f.key, title: t(f.label), sub: '', on: on.has(f.key) }))
          .concat(group === 'Other' ? (st.customMeasurements || []).map(c => ({ id: 'c:' + c.id, title: c.name, sub: t('Custom'), on: c.enabled !== false })) : []),
      })),
    }
  },
  onUnload() { releasePage(this.query) },
  onToggle(e) {
    const { id, on } = e.currentTarget.dataset
    const next = !on
    const key = String(id).slice(2)
    if (String(id).startsWith('b:')) {
      updateM(state => {
        const set = new Set(state.measurementEnabled || [])
        if (next) set.add(key); else set.delete(key)
        state.measurementEnabled = [...set]
      })
    } else {
      updateM(state => {
        const item = state.customMeasurements.find(c => c.id === key)
        if (item) item.enabled = next
      })
    }
  },
  onName(e) { this.setData({ name: e.detail.value }) },
  onAdd() {
    const clean = this.data.name.trim()
    if (!clean) return
    const st = S()
    if (st.customMeasurements.some(c => c.name.toLowerCase() === clean.toLowerCase()) ||
      MEASUREMENT_FIELDS.some(f => f.label.toLowerCase() === clean.toLowerCase())) {
      toast(t('A custom measurement with that name already exists.')); return
    }
    updateM(state => { state.customMeasurements.push({ id: uid(), name: clean.slice(0, 60), enabled: true }) })
    this.setData({ name: '' })
  },
  onDone() { goBack() },
}))
