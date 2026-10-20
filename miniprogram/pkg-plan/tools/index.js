// Share / print / import a plan (frontend/src/sheets.jsx PlanTools).
// Export shares a JSON file to a chat (must run straight from the tap: wx.shareFileMessage needs
// a user gesture). "Print" copies the plan as text (no printing in a mini program). Import picks
// a file from a chat and opens the import page on top of this one.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage } from '../../utils/nav.js'
import { planHasRoutines, exportPlanFile, printWholePlan, importPlanFile } from '../../store/actions.js'

Page(connectPage({
  data: { hasRoutines: false },
  mapState(S) {
    return { hasRoutines: planHasRoutines(S) }
  },
  onLoad(query) {
    this.params = pageParams(query)
  },
  onUnload() {
    this.gone = true
    releasePage(this.query)
  },
  onExport() {
    if (!this.data.hasRoutines || this.busy) return
    this.busy = true
    exportPlanFile()
      .catch(err => console.error(err))
      .then(() => { this.busy = false; if (!this.gone) wx.navigateBack() })
  },
  onPrint() {
    if (!this.data.hasRoutines) return
    printWholePlan()
    wx.navigateBack()
  },
  onImport() {
    // No onRead: the import page stacks on this one (closing here would race its navigateTo).
    importPlanFile()
  },
}))
