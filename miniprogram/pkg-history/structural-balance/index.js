// Structural balance (frontend/src/views/StructuralBalance.jsx): your lifts against a published
// ratio table (lib/structuralBalanceTemplates.js), one row per role, each with its status.
import { connectPage } from '../../utils/page.js'
import { useStore } from '../../store/store.js'
import { exercisePicker, bwSheet } from '../../utils/sheets.js'
import { exOr } from '../../lib/exercises.js'
import { t, exerciseNameFor } from '../../lib/i18n.js'
import { computeBalance, overrideKey, withOverride } from '../lib/structuralBalance.js'
import { balanceStatusView } from '../lib/structuralBalance-view.js'
import { TEMPLATES, TEMPLATE_LIST, DEFAULT_TEMPLATE_ID, EVALUATION_MODES } from '../../lib/structuralBalanceTemplates.js'

const STATUS_COLOR = {
  balanced: 'var(--green)',
  borderline: 'var(--yellow)',
  weak: 'var(--red)',
  'no-data': 'var(--label-3)',
}

// A role pointed at a custom exercise since deleted still names something.
const exerciseName = id => (id ? exerciseNameFor(exOr(id)) : null)

// Own keys only: an imported id such as "constructor" would otherwise find an Object.prototype member.
const templateIdOf = S => (Object.prototype.hasOwnProperty.call(TEMPLATES, S.balanceTemplate) ? S.balanceTemplate : DEFAULT_TEMPLATE_ID)

Page(connectPage({
  data: { tplOpts: [], templateId: DEFAULT_TEMPLATE_ID, rows: [] },

  mapState(S) {
    const templateId = templateIdOf(S)
    const template = TEMPLATES[templateId]
    // computeBalance only when the profile or the table changed (UI ticks such as the rest
    // timer re-run mapState with the same S).
    if (!this._bal || this._bal.S !== S || this._bal.id !== templateId) {
      this._bal = { S, id: templateId, results: computeBalance(S, template) }
    }
    const rows = this._bal.results.map(r => {
      const role = template.roles.find(x => x.id === r.roleId)
      const view = balanceStatusView(r.status, r.needsAnchor)
      const exId = r.mappedExerciseId || r.configuredExerciseId
      const reps = role.evaluationMode === EVALUATION_MODES.REP_COUNT
      const actual = r.status === 'no-data' ? '–' : reps ? r.current.r : `${Math.round(r.actualPct)}%`
      return {
        id: r.roleId,
        label: t(role.label),
        exName: (exerciseName(exId) || '') + (r.isOverridden ? ` · ${t('Custom')}` : ''),
        needsBw: !!r.needsBodyweight,
        needsAnchor: !!r.needsAnchor,
        status: t(view.label),
        statusStyle: 'color:' + (STATUS_COLOR[r.status] || STATUS_COLOR['no-data']),
        value: `${actual} / ${r.targetPct}${reps ? '' : '%'}`,
        overridden: !!r.isOverridden,
      }
    })
    return {
      templateId,
      tplOpts: TEMPLATE_LIST.map(tpl => ({ value: tpl.id, label: t(tpl.label) })),
      rows,
    }
  },

  template() { return TEMPLATES[templateIdOf(useStore.getState().S)] },
  roleOf(e) {
    const id = e.currentTarget.dataset.id
    const template = this.template()
    return { template, role: template.roles.find(r => r.id === id) }
  },
  setOverride(template, role, exId) {
    useStore.getState().update(s => {
      s.balanceOverrides = withOverride(s.balanceOverrides, overrideKey(template, role), exId)
    })
  },

  onTemplate(e) {
    const id = e.detail.value
    useStore.getState().update(s => { s.balanceTemplate = id })
  },
  onLogBw() { bwSheet() },
  // Headed by what a pick does here (the picker's own heading is "Add exercise"). The picker
  // page goes back by itself after onPick.
  onChange(e) {
    const { template, role } = this.roleOf(e)
    if (!role) return
    exercisePicker(ex => { if (ex && ex.id) this.setOverride(template, role, ex.id) }, { title: t('Change exercise') })
  },
  onClear(e) {
    const { template, role } = this.roleOf(e)
    if (role) this.setOverride(template, role, null)
  },
}))
