// Openers for every "sheet" of the web app (frontend/src/sheets.jsx and friends). Each keeps the
// original function's name and arguments; the sheet itself is now a page, which reads the same
// arguments back with pageParams(query). Openers live here, in the main package, because a page
// in one subpackage cannot import code from another subpackage.
//
// A page answers through the callbacks it was handed (onSave, onPick, onDone…), which it simply
// calls: the registry in utils/nav.js keeps the functions alive, nothing is serialised.
import { openPage } from './nav.js'
import { t } from '../lib/i18n.js'
// durationSheet({ title, value, min, max, off, footer, onDone }) — the duration wheel page (pkg-common/duration).
export { durationSheet } from './duration-sheet.js'

const P = (url, params, opts) => openPage(url, params, opts)

/* ---------- generic: confirm and menu ---------- */

// confirmSheet({ title, message, confirmText, cancelText, danger, onConfirm, onCancel })
// wx.showModal fits at most 4 characters per button; longer labels go to the themed menu page,
// where the message is the subtitle and the two buttons are rows.
export function confirmSheet(opts = {}) {
  const confirmText = opts.confirmText || t('Confirm')
  const cancelText = opts.cancelText || t('Cancel')
  if (confirmText.length > 4 || cancelText.length > 4) {
    P('/pkg-common/menu/index', {
      title: opts.title || '',
      subtitle: String(opts.message || ''),
      grouped: false,
      sections: [{ items: [
        { label: confirmText, danger: !!opts.danger, accent: !opts.danger, onClick: () => opts.onConfirm && opts.onConfirm() },
        { label: cancelText, onClick: () => opts.onCancel && opts.onCancel() },
      ] }],
    })
    return
  }
  wx.showModal({
    title: opts.title || '',
    content: String(opts.message || ''),
    confirmText,
    cancelText,
    confirmColor: opts.danger ? '#ff453a' : '#576b95',
    success: r => {
      if (r.confirm) opts.onConfirm && opts.onConfirm()
      else opts.onCancel && opts.onCancel()
    },
  })
}

// menuSheet({ title, subtitle, items, sections }) — items: { label, sub, icon, danger, disabled,
// on, chevron, accent, onClick }. A short flat menu uses the native action sheet; anything richer
// opens the themed menu page (pkg-common/menu).
export function menuSheet(opts = {}) {
  const groups = (opts.sections || [{ items: opts.items }])
    .map(g => ({ title: g.title, items: (g.items || []).filter(Boolean) }))
    .filter(g => g.items.length)
  const flat = groups.length === 1 ? groups[0].items : null
  const simple = flat && flat.length <= 6 && !opts.subtitle &&
    flat.every(it => !it.sub && !it.disabled && it.on == null)
  if (simple) {
    wx.showActionSheet({
      alertText: opts.title || undefined,
      itemList: flat.map(it => String(it.label)),
      success: r => { const it = flat[r.tapIndex]; it && it.onClick && it.onClick() },
    })
    return
  }
  P('/pkg-common/menu/index', Object.assign({}, opts, { sections: groups, grouped: !!opts.sections }))
}

/* ---------- workout (pkg-workout) ---------- */
export const exerciseNoteSheet = entryIdx => P('/pkg-workout/note/index', { kind: 'exercise', entryIdx })
export const setNoteSheet = (entryIdx, setIdx) => P('/pkg-workout/note/index', { kind: 'set', entryIdx, setIdx })
export const sessionNoteSheet = () => P('/pkg-workout/note/index', { kind: 'session' })
export const renameWorkoutSheet = () => P('/pkg-workout/rename/index', {})
export const supersetSheet = (meta, onSave) => P('/pkg-workout/superset/index', { meta, onSave })
export const workoutCompleteSheet = () => P('/pkg-workout/complete/index', {})
export const finishWorkoutSheet = ({ onDiscard } = {}) => P('/pkg-workout/finish/index', { onDiscard })
export const effortPickerSheet = (kind, value, onPick) => P('/pkg-workout/effort/index', { kind, value, onPick })
export const addRoutineToSessionSheet = () => P('/pkg-workout/add-routine/index', {})
export const workoutSettingsSheet = () => P('/pkg-workout/settings/index', {})
export const barWeightSheet = (exId, cfg) => P('/pkg-workout/plates/index', { exId, cfg })

/* ---------- plan (pkg-plan) ---------- */
export const exConfigSheet = (ex, existing, onSave, onDelete, routine, initial, onReplace, saveLabel) =>
  P('/pkg-plan/ex-config/index', { ex, existing, onSave, onDelete, routine, initial, onReplace, saveLabel })
export const glyphPicker = (current, onPick) => P('/pkg-plan/glyph/index', { current, onPick })
export const planToolsSheet = () => P('/pkg-plan/tools/index', {})
export const planImportSheet = bundle => P('/pkg-plan/import/index', { bundle })
export const dayOverrideSheet = iso => P('/pkg-plan/day-override/index', { iso })
export const dayNoteSheet = iso => P('/pkg-plan/day-note/index', { iso })
export const dayAssignSheet = day => P('/pkg-plan/day-assign/index', { day })
export const starterPlanSheet = () => P('/pkg-plan/starter/index', {})
export const equipmentProfileSheet = profile => P('/pkg-plan/equipment-profile/index', { profile })

/* ---------- history & stats (pkg-history) ---------- */
export const workoutDetailSheet = w => P('/pkg-history/workout-detail/index', { w })
export const calendarSheet = start => P('/pkg-history/calendar/index', { start })
export const workoutDateSheet = (w, onDone) => P('/pkg-history/workout-date/index', { w, onDone })
export const workoutDurationSheet = (w, onDone) => P('/pkg-history/workout-duration/index', { w, onDone })
export const exerciseHistorySheet = exId => P('/pkg-history/exercise-history/index', { exId })
export const logPastWorkoutSheet = initial => P('/pkg-history/log-past/index', { initial })

/* ---------- library (pkg-library) ---------- */
export const exerciseDetailSheet = ex => P('/pkg-library/exercise/index', { ex })
export const exercisePicker = (onPick, { title, like } = {}) => P('/pkg-library/picker/index', { onPick, title, like })
export const customExSheet = (existing, onDone, prefill) => P('/pkg-library/custom/index', { existing, onDone, prefill })
export const addToRoutineSheet = ex => P('/pkg-library/add-to-routine/index', { ex })

/* ---------- body (pkg-body) ---------- */
// bwSheet(opts): the original BwSheet props ({ required, onDone, title, … }).
export const bwSheet = (opts = {}) => P('/pkg-body/weigh-in/index', opts)
export const weighInsSheet = () => P('/pkg-body/weigh-ins/index', {})
export const goalSheet = () => P('/pkg-body/goal/index', {})

/* ---------- settings (pkg-settings) ---------- */
export const plateInventorySheet = () => P('/pkg-settings/plates/index', {})
export const dumbbellInventorySheet = () => P('/pkg-settings/dumbbells/index', {})
