// Importing another app's history: a CSV/XML export picked from a chat, or a Hevy account through
// its API. Moved out of store/actions.js because only the Settings pages use it, and with it the
// parsers (import-csv, import-hevy, hevy-id-map, ~100 KB) leave the main package.
import { useStore } from '../../store/store.js'
import { useUI } from '../../store/ui.js'
import { openPage } from '../../utils/nav.js'
import { PAGES, textOf } from '../../store/actions.js'
import { t, tn } from '../../lib/i18n.js'
import { parseImport, mergeImport } from './import-csv.js'
import { importHevyData, HevyApiError, mergeHevyRoutines } from './import-hevy.js'

const S = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const toast = (m, o) => useUI.getState().toast(m, o)

/* ============================ import from another app ============================ */
export const effortLine = (effort, n, scale) => effort === 'none'
  ? tn('{0} set brings an {1} with it. Switch on Effort per set in Settings to see it.', '{0} sets bring an {1} with them. Switch on Effort per set in Settings to see it.', n, scale)
  : tn('{0} set brings an {1} with it.', '{0} sets bring an {1} with them.', n, scale)

// Read a CSV/XML export (picked from a chat when `file` is not given), then open the summary page.
export async function importFromApp(file, onDone) {
  let text
  try { text = await textOf(file) } catch (e) { toast(t('Could not read that file')); return }
  if (text == null) return
  let parsed
  try { parsed = parseImport(String(text), { unit: S().unit, customEx: S().customEx }) }
  catch (e) { toast(t('Could not read that file')); return }
  if (parsed.error === 'empty') { toast(t('That file is empty')); return }
  if (parsed.error) { toast(t("We don't recognise that file's columns. Check the docs for supported apps.")); return }
  if (parsed.kind === 'bodyweight' ? !parsed.bodyweight.length : !parsed.workouts.length) {
    toast(t('Nothing to import from that file')); return
  }
  openPage(PAGES.importSummary, { parsed })
  onDone && onDone()
}
// The summary page's Import (ImportSummary.doImport). Returns how many were added.
export function applyImport(parsed) {
  const isBW = parsed.kind === 'bodyweight'
  let res = { added: 0 }
  update(s => { res = mergeImport(s, parsed) })
  toast(isBW
    ? tn('{0} weigh-in imported', '{0} weigh-ins imported', res.added)
    : tn('{0} workout imported', '{0} workouts imported', res.added))
  return res.added
}

/* ============================ import from Hevy ============================ */
export function importFromHevy() {
  openPage(PAGES.hevyImport, {})
}
// HevyImportSheet.fetchAccount: the account's data, or null after a toast saying why not.
export async function fetchHevy(apiKey, onProgress) {
  const key = String(apiKey || '').trim()
  if (!key) { toast(t('Paste your Hevy API key first')); return null }
  const st = S()
  try {
    const data = await importHevyData(key, { unit: st.unit, customEx: st.customEx, onProgress })
    const empty = !data.workouts.workouts.length && !data.routines.routines.length && !data.bodyweight.bodyweight.length
    if (empty) { toast(t('Nothing to import from Hevy')); return null }
    return data
  } catch (e) {
    if (e instanceof HevyApiError && e.message === 'auth') toast(t('That Hevy API key was refused'))
    else if (e instanceof HevyApiError && e.message === 'rate-limit') toast(t('Hevy is rate-limiting requests. Wait a minute and try again'))
    else if (e instanceof HevyApiError && e.message === 'empty') toast(t('Paste your Hevy API key first'))
    else toast(t('Couldn’t reach Hevy. Check the key and try again'))
    return null
  }
}
// HevyImportSheet.doImport. Returns { workouts, routines, bodyweight } added.
export function applyHevyImport(payload, { wantWorkouts = true, wantRoutines = true, wantBody = true } = {}) {
  const parts = []
  const added = { workouts: 0, routines: 0, bodyweight: 0 }
  if (!payload) return added
  update(s => {
    if (wantWorkouts && payload.workouts.workouts.length) {
      const res = mergeImport(s, payload.workouts)
      added.workouts = res.added
      parts.push(tn('{0} workout imported', '{0} workouts imported', res.added))
    }
    if (wantRoutines && payload.routines.routines.length) {
      const res = mergeHevyRoutines(s, payload.routines)
      added.routines = res.added
      parts.push(tn('{0} routine imported', '{0} routines imported', res.added))
    }
    if (wantBody && payload.bodyweight.bodyweight.length) {
      const res = mergeImport(s, payload.bodyweight)
      added.bodyweight = res.added
      parts.push(tn('{0} weigh-in imported', '{0} weigh-ins imported', res.added))
    }
  })
  if (!added.workouts && !added.routines && !added.bodyweight) toast(t('Nothing new to import'))
  else toast(parts.join(' · '))
  return added
}
