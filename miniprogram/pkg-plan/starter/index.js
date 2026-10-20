// Choose a starter plan (frontend/src/sheets.jsx StarterPlanChooser): optionally fitted to one of
// your equipment profiles. A pick goes back first; store/actions.js chooseStarterPlan then loads
// it (or asks with wx.showModal when a day it claims is taken) from the page underneath.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage } from '../../utils/nav.js'
import { useStore } from '../../store/store.js'
import { afterSheet, chooseStarterPlan, starterPlanCopy } from '../../store/actions.js'
import { activeProfile } from '../../lib/equipment.js'
import { starterPlanOptions } from '../../lib/starter.js'
import { t } from '../../lib/i18n.js'

Page(connectPage({
  data: { profiles: [], asWritten: true, plans: [] },
  mapState(S) {
    const profiles = S.equipProfiles || []
    // Fitting starts on for the profile you already filter by; '' leaves the plan as written.
    if (this.fitId == null) this.fitId = (activeProfile(S) || {}).id || ''
    const fit = profiles.find(p => p.id === this.fitId) || null
    return {
      asWritten: !fit,
      profiles: profiles.map(p => ({ id: p.id, name: p.name, on: !!fit && fit.id === p.id })),
      plans: starterPlanOptions().map(({ id, days }) => {
        const { name, about } = starterPlanCopy(id)
        return { id, name, sub: t('{0} days per week', days) + ' · ' + about }
      }),
    }
  },
  onLoad(query) {
    this.params = pageParams(query)
  },
  onUnload() {
    releasePage(this.query)
  },
  onFit(e) {
    this.fitId = e.currentTarget.dataset.id || ''
    this.__refresh()
  },
  onChoose(e) {
    if (this.done) return
    this.done = true
    const id = e.currentTarget.dataset.id
    const fit = (useStore.getState().S.equipProfiles || []).find(p => p.id === this.fitId) || null
    wx.navigateBack()
    afterSheet(() => chooseStarterPlan(id, fit))
  },
}))
