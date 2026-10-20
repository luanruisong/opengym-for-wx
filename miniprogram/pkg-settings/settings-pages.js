// Settings: which page each row lives on, and the index the search field reads
// (frontend/src/views/settings-pages.js). The mini program is local only and Chinese only, so the
// pages and rows that need a server, a push service, the phone app's native side or a language
// choice are gone: account, coach, reminders, language, sync, passkeys, password, device pairing,
// admin, push, update check, Health Connect, the install tip, auto-backup and its folder, and the
// exercise animation/drawing rows (this build ships no exercise media).
//
// Every SEARCH entry has an `id`: the page tags the row with class "fk-<id>", so a search hit can
// scroll to it and flash it (the original found the row by its text).
import { t } from '../lib/i18n.js'
import { ACCENT_NAMES } from '../lib/format.js'

export const PAGES = {
  workout: { title: 'Workout', icon: 'play', tint: 'var(--green)' },
  alerts: { title: 'Timer alerts', icon: 'speaker', tint: 'var(--pink)' },
  plan: { title: 'Plan & schedule', icon: 'calendar', tint: 'var(--orange)' },
  units: { title: 'Units & language', icon: 'ruler', tint: 'var(--teal)' },
  equipment: { title: 'Equipment', icon: 'kettlebell', tint: 'var(--indigo)' },
  look: { title: 'Look & Home', icon: 'palette', tint: 'var(--purple)' },
  data: { title: 'Data & backup', icon: 'folder', tint: 'var(--blue)' },
  // No update check here: 'About & updates' is just 'About'.
  about: { title: '关于', icon: 'info', tint: 'var(--grey)' },
  advanced: { title: 'Fine-tuning', icon: 'wrench', tint: 'var(--grey)', parent: 'workout' },
}
export const PAGE_IDS = Object.keys(PAGES)

/** A page's title as shown. */
export const pageTitle = id => (PAGES[id] ? t(PAGES[id].title) : '')

// The root, top to bottom.
export const ROOT_GROUPS = [['workout', 'alerts'], ['plan', 'units', 'equipment'], ['look'], ['data', 'about']]

// Every page this build has is there on every device.
export function pageVisible(page) {
  return Object.prototype.hasOwnProperty.call(PAGES, page)
}

export const SEARCH = [
  // Workout
  { id: 'restTimer', page: 'workout', title: 'Rest timer', icon: 'timer', tint: 'var(--orange)', kw: 'rest pause break seconds minutes timer countdown' },
  { id: 'restPause', page: 'workout', title: 'Rest-pause rest', icon: 'bolt', tint: 'var(--orange)', kw: 'burst cluster rest pause' },
  { id: 'effort', page: 'workout', title: 'Effort per set', icon: 'gauge', tint: 'var(--purple)', kw: 'rir rpe effort reps in reserve difficulty', opts: ['RIR', 'RPE'] },
  { id: 'logRef', page: 'workout', title: 'Shown under each exercise', icon: 'history', tint: 'var(--blue)', kw: 'last time best set reference previous', opts: ['Last time', 'Best set'] },
  { id: 'layout', page: 'workout', title: 'Layout', icon: 'layout', tint: 'var(--blue)', kw: 'workout view cards list compact', opts: ['Cards', 'List', 'Compact'] },
  { id: 'collapse', page: 'workout', title: 'Collapse completed exercises', icon: 'minimize', tint: 'var(--teal)', kw: 'collapse fold minimize hide done finished completed exercises list compact remaining left to do' },
  { id: 'weighIn', page: 'workout', title: 'Weigh in before workouts', icon: 'scale', tint: 'var(--green)', kw: 'body weight weigh scale start' },
  { id: 'keepAwake', page: 'workout', title: 'Keep screen awake', icon: 'phoneScreen', tint: 'var(--yellow)', kw: 'wake lock screen sleep display on' },
  { id: 'advanced', page: 'workout', title: 'Fine-tuning', icon: 'wrench', tint: 'var(--grey)', kw: 'advanced more options' },
  // Fine-tuning
  { id: 'startFrom', page: 'advanced', title: 'Planned sessions start from', icon: 'clipboard', tint: 'var(--green)', kw: 'start from plan last session reps carry over', opts: ['Your plan', 'Your last session'] },
  { id: 'overtime', page: 'advanced', title: 'Keep timing after target', icon: 'stopwatch', tint: 'var(--orange)', kw: 'timed set overtime hold duration' },
  { id: 'wc_steppers', page: 'advanced', title: 'Weight and reps buttons', icon: 'plusCircle', tint: 'var(--green)', kw: 'steppers plus minus buttons workout controls' },
  { id: 'wc_setShortcuts', page: 'advanced', title: 'Drop and burst shortcuts on every set', icon: 'bolt', tint: 'var(--orange)', kw: 'drop set burst shortcuts workout controls' },
  { id: 'wc_swipeSets', page: 'advanced', title: 'Swipe actions', icon: 'swap', tint: 'var(--indigo)', kw: 'swipe gesture slide delete remove copy duplicate set routine loop plan workout controls', tkw: () => t('swipe gesture') },
  { id: 'wc_exerciseChips', page: 'advanced', title: 'Exercise chips at the top', icon: 'more', tint: 'var(--mint)', kw: 'chips dots overview progress jump navigate exercise list workout controls' },
  { id: 'wc_pairButtons', page: 'advanced', title: 'Superset buttons in the exercise header', icon: 'link', tint: 'var(--blue)', kw: 'superset pair workout controls' },
  { id: 'wc_exerciseButtons', page: 'advanced', title: 'Move, swap and remove buttons below the exercise', icon: 'swap', tint: 'var(--teal)', kw: 'move swap remove replace workout controls' },
  // Timer alerts
  { id: 'sound', page: 'alerts', title: 'Play a sound', icon: 'speaker', tint: 'var(--pink)', kw: 'sound sounds audio beep chime volume' },
  { id: 'soundPick', page: 'alerts', title: 'Sound', icon: 'bell', tint: 'var(--pink)', kw: 'classic timer sound beep chime tone bell whistle soft ringtone custom rest end', opts: ['Chime (louder)', 'Classic beeps', 'Bell', 'Beep-beep', 'Whistle', 'Soft'], when: c => c.sound },
  { id: 'soundOnSilent', page: 'alerts', title: 'Play even on silent', icon: 'speaker', tint: 'var(--orange)', kw: 'silent mute ring switch iphone music', when: c => c.sound && c.playOnSilent },
  { id: 'vibrate', page: 'alerts', title: 'Vibrate', icon: 'vibrate', tint: 'var(--indigo)', kw: 'vibrate vibration haptic haptics buzz' },
  { id: 'timerFlash', page: 'alerts', title: 'Flash the screen', icon: 'sun', tint: 'var(--yellow)', kw: 'flash light blink screen' },
  // Plan & schedule
  { id: 'mode', page: 'plan', title: 'How you train', icon: 'repeat', tint: 'var(--orange)', kw: 'scheduling schedule rotation fixed week split loop round cycle', opts: ['Fixed Week', 'Rotation'] },
  { id: 'weekStart', page: 'plan', title: 'Week starts on', icon: 'calendar', tint: 'var(--orange)', kw: 'monday sunday first day week', opts: ['Monday', 'Sunday'], tkw: () => t('week start') },
  { id: 'starter', page: 'plan', title: 'Load starter plan', icon: 'clipboard', tint: 'var(--green)', kw: 'starter template beginner program routine' },
  // Units
  { id: 'enParens', page: 'units', title: 'English exercise names', icon: 'globe', tint: 'var(--purple)', kw: 'exercise names english translation' },
  { id: 'enOnly', page: 'units', title: 'English names only', icon: 'globe', tint: 'var(--purple)', kw: 'exercise names english translation' },
  { id: 'unit', page: 'units', title: 'Weight unit', icon: 'scale', tint: 'var(--teal)', kw: 'kg lb lbs pounds kilos kilograms unit' },
  { id: 'wdec', page: 'units', title: 'Weight decimals', icon: 'ruler', tint: 'var(--teal)', kw: 'decimals precision microplates rounding' },
  { id: 'speed', page: 'units', title: 'Speed unit', icon: 'figureRun', tint: 'var(--teal)', kw: 'speed mph kmh km/h miles cardio' },
  { id: 'formula', page: 'units', title: '1RM formula', icon: 'chart', tint: 'var(--teal)', kw: '1rm one rep max epley brzycki lombardi formula estimate' },
  // Equipment
  { id: 'plates', page: 'equipment', title: 'Plates', icon: 'plate', tint: 'var(--orange)', kw: 'plates bar plate math barbell' },
  { id: 'dumbbells', page: 'equipment', title: 'Dumbbells', icon: 'dumbbell', tint: 'var(--teal)', kw: 'dumbbells dumbbell rack inventory adjustable weights own home gym' },
  { id: 'equipFilter', page: 'equipment', title: 'Filter by equipment', icon: 'kettlebell', tint: 'var(--green)', kw: 'equipment filter home gym', when: c => c.profiles },
  { id: 'activeProfile', page: 'equipment', title: 'Active profile', icon: 'house', tint: 'var(--blue)', kw: 'equipment profile home gym', when: c => c.profiles },
  { id: 'addProfile', page: 'equipment', title: 'Add equipment profile', icon: 'plusCircle', tint: 'var(--green)', kw: 'equipment profile home gym hotel' },
  // Look & Home
  { id: 'theme', page: 'look', title: 'Theme', icon: 'moon', tint: 'var(--indigo)', kw: 'dark mode light mode theme appearance night', opts: ['Dark', 'Light', 'System'] },
  { id: 'accent', page: 'look', title: 'Accent color', icon: 'palette', tint: 'var(--purple)', kw: 'color colour accent tint custom own picker hex rgb', opts: [...Object.values(ACCENT_NAMES), 'Your own color'], tkw: () => t('custom color picker') },
  { id: 'body', page: 'look', title: 'Body diagram', icon: 'figureStrength', tint: 'var(--teal)', kw: 'muscle map body male female', opts: ['Male', 'Female'] },
  { id: 'checkIn', page: 'look', title: 'Gym check-in', icon: 'qr', tint: 'var(--blue)', kw: 'qr code membership card check in barcode' },
  { id: 'weightCard', page: 'look', title: 'Body weight', icon: 'scale', tint: 'var(--green)', kw: 'weight card home' },
  // Data & backup
  { id: 'export', page: 'data', title: 'Export backup (JSON)', icon: 'share', tint: 'var(--blue)', kw: 'export backup json download save' },
  { id: 'exportZip', page: 'data', title: 'Export with photos & videos (.zip)', icon: 'share', tint: 'var(--blue)', kw: 'zip media export backup', when: c => c.hasMedia },
  { id: 'import', page: 'data', title: 'Import backup', icon: 'download', tint: 'var(--teal)', kw: 'import restore backup json zip' },
  { id: 'importApp', page: 'data', title: 'Import from another app', icon: 'download', tint: 'var(--teal)', kw: 'strong hevy fitnotes apple health csv import' },
  { id: 'hevy', page: 'data', title: 'Import from Hevy', icon: 'key', tint: 'var(--teal)', kw: 'hevy api import' },
  { id: 'media', page: 'data', title: 'Photos & videos', icon: 'image', tint: 'var(--teal)', kw: 'media storage photos videos upload', when: c => c.hasMedia },
  { id: 'storage', page: 'data', title: '本机存储空间', icon: 'folder', tint: 'var(--grey)', kw: 'storage space size usage quota', tkw: () => '存储 空间 占用 容量' },
  { id: 'reset', page: 'data', title: 'Reset everything', icon: 'trash', tint: 'var(--red)', kw: 'delete wipe reset erase' },
  // About
  { id: 'version', page: 'about', title: 'Version', icon: 'info', tint: 'var(--grey)', kw: 'version about licence license source code open source' },
]

// Lower case, accents and other marks dropped, so "théme", "Thème" and "theme" meet. Written
// without \p{…} classes, which older mini program JS engines do not all have.
export const fold = s => {
  let v = String(s || '')
  try { v = v.normalize('NFD') } catch (e) { /* no normalize: keep as is */ }
  return v.replace(/[̀-ͯ]/g, '').toLowerCase()
}

const WORD_CHAR = /[0-9A-Za-zÀ-ɏͰ-ϿЀ-ӿ一-鿿]/
const atWordStart = (hay, w) => {
  for (let i = hay.indexOf(w); i !== -1; i = hay.indexOf(w, i + 1)) if (i === 0 || !WORD_CHAR.test(hay[i - 1])) return true
  return false
}

/** The trail a hit names under its title: "Workout" or "Workout › Fine-tuning". */
export function pageTrail(page, tr = t) {
  const p = PAGES[page]
  if (!p) return ''
  return p.parent ? tr(PAGES[p.parent].title) + ' › ' + tr(p.title) : tr(p.title)
}

/**
 * Settings rows matching a query, best first: every word of the query has to appear in the
 * row's title, its page, or its extra words (in English and in Chinese). A title that starts with
 * the query ranks first, then a title containing it, then the rest. Pages are hits too.
 */
export function searchSettings(query, ctx, tr = t) {
  const words = fold(query).trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const q = words.join(' ')
  const hits = []
  const consider = (entry, isPage) => {
    const title = tr(entry.title)
    const opts = entry.opts || []
    const own = fold([title, ...opts.map(o => tr(o)), entry.tkw ? entry.tkw() : '', isPage ? '' : pageTrail(entry.page, tr)].join(' '))
    const en = fold([entry.title, entry.kw || '', ...opts, isPage ? '' : (PAGES[entry.page] || {}).title].join(' '))
    if (!words.every(w => own.includes(w) || atWordStart(en, w))) return
    const ft = fold(title)
    const rank = ft.startsWith(q) ? 0 : ft.includes(q) ? 1 : isPage ? 2 : 3
    hits.push(Object.assign({}, entry, { label: title, trail: isPage ? tr('Settings') : pageTrail(entry.page, tr), isPage, rank }))
  }
  for (const id of PAGE_IDS) {
    if (id === 'advanced') continue
    consider({ id: 'page:' + id, page: id, title: PAGES[id].title, icon: PAGES[id].icon, tint: PAGES[id].tint }, true)
  }
  for (const e of SEARCH) {
    if (e.when && !e.when(ctx)) continue
    consider(e, false)
  }
  return hits.sort((a, b) => a.rank - b.rank)
}

// The openGym release this build was ported from (frontend/package.json), the original's
// __APP_VERSION__.
export const APP_VERSION = '1.4.1'
