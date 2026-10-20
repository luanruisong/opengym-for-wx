// One Settings page (frontend/src/views/Settings.jsx `pages`): /pkg-settings/page/index?page=<id>
// [&find=<row id>]. The page id picks the block the WXML shows; `find` is a search hit's row,
// scrolled to and flashed once. What each row does is the original's; rows that need the server,
// the phone app or a language choice are not here (see ../settings-pages.js).
import { connectPage } from '../../utils/page.js'
import { navTo } from '../../utils/nav.js'
import { confirmSheet, menuSheet, durationSheet, starterPlanSheet, equipmentProfileSheet, plateInventorySheet, dumbbellInventorySheet } from '../../utils/sheets.js'
import { useStore } from '../../store/store.js'
import { useUI } from '../../store/ui.js'
import { pickFile, saveAndShareFile } from '../../store/actions.js'
import { importFromApp, importFromHevy } from '../lib/imports.js'
import { t, tn, setLang } from '../../lib/i18n.js'
import { workoutControls } from '../../lib/workout-controls.js'
import { speedUnitOf } from '../../lib/speed.js'
import { formulaOf, FORMULA_NAMES } from '../../lib/onerm.js'
import { copyText } from '../../lib/clipboard.js'
import { ACCENTS, ACCENT_NAMES, todayISO, weekStartOf, MONDAY, SUNDAY, fmtPlate, setWeightDecimals } from '../../lib/format.js'
import { inventoryFor, ownsPlates } from '../../lib/plates.js'
import { dumbbellsOf } from '../../lib/dumbbells.js'
import { effortOf } from '../../lib/history.js'
import { unlock, chime, playOnSilentSupported, vibrateSupported, appleTouchDevice, setPlayOnSilent, setVibrate } from '../../lib/sound.js'
import { REST_SOUND_IDS, restSoundOf } from '../../lib/rest-sounds.js'
import { scheduleModeOf, chooseFixedWeek, chooseRotation } from '../../lib/rotation.js'
import { queueOf } from '../../lib/queue.js'
import { wakeLockSupported } from '../../lib/wakelock.js'
import { referencedFiles } from '../../lib/media-refs.js'
import { mediaStore } from '../../lib/media-store.js'
import { setRestAccent } from '../lib/rest-alert.js'
import { CUSTOM, accentKey, adjustedIn, cleanHex, inkOn, isGrey } from '../../lib/accent.js'
import { REST_MAX, REST_PAUSE_MIN, REST_PAUSE_MAX, fmtRest, fmtDuration } from '../../lib/duration.js'
import { exportBackupZip, readBackupFile, backupImportError, storeBackupMedia } from '../lib/backup-media.js'
import { storage } from '../../utils/storage.js'
import { PAGES, SEARCH, pageTitle, APP_VERSION } from '../settings-pages.js'

const REPO_URL = 'https://github.com/DuarteSantos8/openGym'

const st = () => useStore.getState()
const update = mut => st().update(mut)
const toast = (m, o) => useUI.getState().toast(m, o)

/* ---------------- static labels (t() once; WXML cannot call it) ---------------- */
const LABELS = {
  rest: 'Rest', restFoot: 'Each exercise can have its own rest too. Set it in the exercise settings of a routine.',
  restTimer: 'Rest timer', restPause: 'Rest-pause rest',
  logging: 'Logging', effort: 'Effort per set', logRef: 'Shown under each exercise', layout: 'Layout',
  collapse: 'Collapse completed exercises', collapseSub: 'In List and Compact, a finished exercise folds into one line.',
  beforeDuring: 'Before and during', weighIn: 'Weigh in before workouts',
  weighInSub: 'Asks for your body weight when a workout starts. Off starts the session straight away.',
  keepAwake: 'Keep screen awake', keepAwakeSub: 'The screen stays on while a workout is running, so you don’t have to unlock your phone between sets.',
  notSupported: 'Not supported in this browser.',
  fineTuning: 'Fine-tuning', fineTuningSub: 'Buttons, timed sets',
  sessionsTimed: 'Sessions and timed sets', startFrom: 'Planned sessions start from',
  overtime: 'Keep timing after target', overtimeSub: 'Timed sets continue up to 15 extra minutes. Tap Done to log the actual duration.',
  wcTitle: 'Buttons on the workout screen', wcFoot: 'Everything hidden here stays one tap away: the ⋯ button of an exercise and the number of a set.',
  steppers: 'Weight and reps buttons', steppersSub: 'Off: tap the number and type it',
  setShortcuts: 'Drop and burst shortcuts on every set',
  swipeSets: 'Swipe actions', swipeSetsSub: 'Sets, routines and the loop: left removes, right copies',
  exerciseChips: 'Exercise chips at the top', exerciseChipsSub: 'A numbered dot per exercise, filled as you go. Tap one to jump there.',
  pairButtons: 'Superset buttons in the exercise header',
  exerciseButtons: 'Move, swap and remove buttons below the exercise',
  restEnds: 'When a rest ends', playSound: 'Play a sound', sound: 'Sound', soundOnSilent: 'Play even on silent',
  vibrate: 'Vibrate', timerFlash: 'Flash the screen', tapToHear: 'Tap one to hear it.', done: 'Done',
  howTrain: 'How you train', rotation: 'Rotation', external: 'Externally managed', buildLoop: 'Build your loop in Plan',
  weekStart: 'Week starts on', starter: 'Load starter plan',
  enParens: 'English exercise names', enParensSub: 'Show the English name in parentheses next to the translated one.',
  enOnly: 'English names only', enOnlySub: 'Replace the translated names with the original English ones.',
  unitFoot: 'Switching the unit offers to convert every stored weight.',
  unit: 'Weight unit', wdec: 'Weight decimals', wdecSub: 'How precisely weights are shown.',
  speed: 'Speed unit', formula: '1RM formula',
  equipment: 'Equipment', equipFoot: 'Filters the exercise library and picker, and flags routine exercises that need something you don’t have in the active profile.',
  plates: 'Plates', dumbbells: 'Dumbbells', equipFilter: 'Filter by equipment', activeProfile: 'Active profile',
  addProfile: 'Add equipment profile', del: 'Delete',
  theme: 'Theme', accent: 'Accent color', body: 'Body diagram', onHome: 'On Home',
  checkIn: 'Gym check-in', checkInSub: 'Show a card on Home with your membership QR codes.',
  weightCard: 'Body weight', weightCardSub: 'Show the body weight card on Home.',
  backUp: 'Back up', export: 'Export backup (JSON)', exportZip: 'Export with photos & videos (.zip)',
  bringIn: 'Bring data in', import: 'Import backup',
  importApp: 'Import from another app', importAppSub: 'FitNotes, Strong, Hevy, or body weight from Apple Health',
  hevy: 'Import from Hevy', hevySub: 'Pull your history with a Hevy Pro API key',
  media: 'Photos & videos', reset: 'Reset everything', share: 'Share',
  version: 'Version', license: 'free & open source (AGPL v3)', source: 'Source code',
  local: 'All data stays on this phone', localSub: 'No account, no cloud. Back it up anytime in Data & backup.',
  effortIntro: 'How hard a set was, logged next to weight and reps. Two scales for the same judgement, counted from opposite ends.',
  rir: 'RIR', rpe: 'RPE', howFelt: 'How it felt',
  effortNote1: 'RIR counts the reps you left in the tank; RPE reads the same effort off a 10-point scale, so RPE ≈ 10 − RIR. Pick whichever you already think in.',
  effortNote2: 'The highlighted row is where most working sets land. Sets you have already logged keep their own scale, and nothing else reads the value, so progression and estimated 1RM are unaffected.',
  ownColor: 'Your own color', save: 'Save', cancel: 'Cancel',
}
let labels = null
const L = () => {
  if (!labels) { labels = {}; for (const k of Object.keys(LABELS)) labels[k] = t(LABELS[k]) }
  return labels
}

const EFFORT_ROWS = [
  ['0', '10', 'Nothing left, went to failure'],
  ['1', '9', 'One more rep in the tank'],
  ['2', '8', 'Two more reps'],
  ['3', '7', 'Three more reps'],
  ['4+', '≤6', 'Easy, warm-up territory'],
]
const EFFORT_TYPICAL = 2

const REST_SOUND_LABEL = { chime: 'Chime (louder)', classic: 'Classic beeps', bell: 'Bell', beep: 'Beep-beep', whistle: 'Whistle', soft: 'Soft' }
const REST_SOUND_HINT = {
  classic: 'The quieter three-beep sound from before 1.3.9, instead of the louder chime.',
  bell: 'Ding-dong. Rest is over, class is in.',
  beep: 'Your sports watch, calling you back.',
  whistle: 'Coach wants you back on the bar.',
  soft: 'Gentle, for headphones or a quiet room.',
}

const FORMULA_OPTS = () => [
  { value: 'epley', label: 'Epley', sub: t('The common one. A bit generous at higher reps.') },
  { value: 'brzycki', label: 'Brzycki', sub: t('More conservative above five reps.') },
  { value: 'lombardi', label: 'Lombardi', sub: t('Generous, especially at high reps.') },
  { value: 'oconner', label: FORMULA_NAMES.oconner, sub: t('The most conservative of the classics.') },
  { value: 'mayhew', label: 'Mayhew' },
  { value: 'wathan', label: 'Wathan' },
  { value: 'lander', label: 'Lander' },
  { value: 'weighted', label: t('Blend of all'), sub: t('Averages seven formulas and reads your RIR when you log it.') },
]
const LOGREF_OPTS = () => [
  { value: 'last', label: t('Last time'), sub: t('What you did the last time, in that routine.') },
  { value: 'best', label: t('Best set'), sub: t('Your heaviest set of the exercise, from any workout.') },
]
const STARTFROM_OPTS = () => [
  { value: 'plan', label: t('Your plan'), sub: t('The routine’s sets and reps. Your history decides the weight.') },
  { value: 'last', label: t('Your last session'), sub: t('The reps you logged last time in that routine, carried over.') },
]

// A picker row of the original (SelectRow): the value's label on the row, the choices in a menu.
function selectMenu(title, opts, cur, onPick) {
  menuSheet({
    title,
    items: opts.map(o => ({ label: o.label, sub: o.sub, on: o.value === cur, onClick: () => { if (o.value !== cur) onPick(o.value) } })),
  })
}
const labelOf = (opts, v) => (opts.find(o => o.value === v) || opts[0]).label

/* ---------------- switches: one handler each (sw_<key>), no dataset on components ---------------- */
const nameFlags = s => ({ showEn: (s.enParens || {}).zh !== false, enOnly: (s.enOnly || {}).zh === true })
const applyNames = () => { const f = nameFlags(st().S); setLang('zh', f.showEn, f.enOnly) }

const setWc = k => (s, v) => { s.wc = Object.assign({}, workoutControls(s), { [k]: v }) }
const SWITCHES = {
  collapse: { get: S => !!S.collapseCompleted, set: (s, v) => { s.collapseCompleted = v; if (s.active) delete s.active.collapseCompleted } },
  weighIn: { get: S => S.weighIn !== false, set: (s, v) => { s.weighIn = v } },
  keepAwake: { get: S => wakeLockSupported() && S.keepAwake !== false, set: (s, v) => { s.keepAwake = v } },
  overtime: { get: S => !!S.timedSetOvertime, set: (s, v) => { s.timedSetOvertime = v } },
  wc_steppers: { get: S => workoutControls(S).steppers, set: setWc('steppers') },
  wc_setShortcuts: { get: S => workoutControls(S).setShortcuts, set: setWc('setShortcuts') },
  wc_swipeSets: { get: S => workoutControls(S).swipeSets, set: setWc('swipeSets') },
  wc_exerciseChips: { get: S => workoutControls(S).exerciseChips, set: setWc('exerciseChips') },
  wc_pairButtons: { get: S => workoutControls(S).pairButtons, set: setWc('pairButtons') },
  wc_exerciseButtons: { get: S => workoutControls(S).exerciseButtons, set: setWc('exerciseButtons') },
  // Turning the sound on is a tap: warm the audio up now (the original unlocked iOS audio here).
  sound: { get: S => !!S.sound, set: (s, v) => { s.sound = v }, before: v => { if (v) unlock(true) } },
  soundOnSilent: { get: S => !!S.soundOnSilent, set: (s, v) => { s.soundOnSilent = v }, after: v => setPlayOnSilent(v) },
  vibrate: { get: S => vibrateSupported() && S.vibrate !== false, set: (s, v) => { s.vibrate = v }, after: v => setVibrate(v) },
  timerFlash: { get: S => !!S.timerFlash, set: (s, v) => { s.timerFlash = v } },
  enParens: { get: S => (S.enParens || {}).zh !== false, set: (s, v) => { s.enParens = Object.assign({}, s.enParens || {}, { zh: v }) }, after: applyNames },
  enOnly: { get: S => (S.enOnly || {}).zh === true, set: (s, v) => { s.enOnly = Object.assign({}, s.enOnly || {}, { zh: v }) }, after: applyNames },
  equipFilter: { get: S => !!S.equipFilterOn, set: (s, v) => { s.equipFilterOn = v } },
  checkIn: { get: S => S.checkIn !== false, set: (s, v) => { s.checkIn = v } },
  weightCard: { get: S => S.showWeightCard !== false, set: (s, v) => { s.showWeightCard = v } },
}

/* ---------------- segmented controls (seg_<key>) ---------------- */
const liveQueue = S => queueOf(S)
const externalQueue = S => { const q = liveQueue(S); return !!q && (!S.rotation || q.rotationId !== S.rotation.id) }

// Fixed Week or Rotation (Settings.jsx setScheduleMode).
function setScheduleMode(v) {
  const S = st().S
  if (v === scheduleModeOf(S)) return
  if (v === 'week') {
    if (!liveQueue(S)) { update(s => { chooseFixedWeek(s) }); return }
    confirmSheet({
      title: t('Back to a fixed week?'),
      message: t('The loop stops. Your weekdays stay as they are, and the loop is saved for later.'),
      confirmText: t('Use Fixed Week'),
      onConfirm: () => update(s => { chooseFixedWeek(s) }),
    })
    return
  }
  update(s => { chooseRotation(s) })
}

// Two honest choices on a unit switch (issue #22): convert the numbers, or only change the label.
function switchUnit(v) {
  const S = st().S
  if (v === S.unit) return
  menuSheet({
    title: t('Convert to {0}?', v),
    subtitle: t('Every stored weight (logged sets, working weights, routine targets, body weight, bar weights) is in {0}. Convert the numbers, or keep them and only change the label?', S.unit),
    items: [
      { icon: 'calculator', label: t('Convert the numbers'), onClick: () => st().setUnit(v) },
      { icon: 'pencil', label: t('Keep the numbers, change the label'), onClick: () => st().setUnit(v, { convert: false }) },
    ],
  })
}

const SEGS = {
  effort: {
    options: () => [{ value: 'none', label: t('Off') }, { value: 'rir', label: t('RIR') }, { value: 'rpe', label: t('RPE') }],
    get: S => effortOf(S),
    set: v => update(s => { s.effort = v; delete s.showRir }),
  },
  // Cards, List, Compact. The original's Focus layout is not in this build; a stored 'focus'
  // reads as cards.
  layout: {
    options: () => [{ value: 'cards', label: t('Cards') }, { value: 'list', label: t('List') }, { value: 'compact', label: t('Compact') }],
    get: S => (['list', 'compact'].includes(S.workoutView) ? S.workoutView : 'cards'),
    set: v => update(s => { s.workoutView = v }),
  },
  mode: {
    options: () => [{ value: 'week', label: t('Fixed Week') }, { value: 'rotation', label: t('Rotation') }],
    get: S => scheduleModeOf(S),
    set: setScheduleMode,
  },
  weekStart: {
    options: () => [{ value: MONDAY, label: t('Monday') }, { value: SUNDAY, label: t('Sunday') }],
    get: S => weekStartOf(S),
    set: v => update(s => { s.weekStart = v }),
  },
  unit: {
    options: () => [{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }],
    get: S => S.unit,
    set: switchUnit,
  },
  wdec: {
    options: () => [{ value: 1, label: t('0.5') }, { value: 2, label: t('0.25') }],
    get: S => (S.wdec === 2 ? 2 : 1),
    set: v => { update(s => { s.wdec = v }); setWeightDecimals(v) },
  },
  speed: {
    options: () => [{ value: 'kmh', label: 'km/h' }, { value: 'mph', label: 'mph' }],
    get: S => speedUnitOf(S),
    set: v => update(s => { s.speedUnit = v }),
  },
  theme: {
    options: () => [{ value: 'dark', icon: 'moon', label: t('Dark') }, { value: 'light', icon: 'sun', label: t('Light') }, { value: 'system', icon: 'gear', label: t('System') }],
    get: S => S.theme || 'dark',
    set: v => update(s => { s.theme = v }),
  },
  body: {
    options: () => [{ value: 'male', label: t('Male') }, { value: 'female', label: t('Female') }],
    get: S => (S.body === 'female' ? 'female' : 'male'),
    set: v => update(s => { s.body = v }),
  },
}
// Which controls each page shows (so mapState only works out what is on screen).
const PAGE_SW = {
  workout: ['collapse', 'weighIn', 'keepAwake'],
  advanced: ['overtime', 'wc_steppers', 'wc_setShortcuts', 'wc_swipeSets', 'wc_exerciseChips', 'wc_pairButtons', 'wc_exerciseButtons'],
  alerts: ['sound', 'soundOnSilent', 'vibrate', 'timerFlash'],
  units: ['enParens', 'enOnly'],
  equipment: ['equipFilter'],
  look: ['checkIn', 'weightCard'],
}
const PAGE_SEG = {
  workout: ['effort', 'layout'], plan: ['mode', 'weekStart'], units: ['unit', 'wdec', 'speed'], look: ['theme', 'body'],
}

/* ---------------- colour helpers for "Your own color" (no native colour picker here) ---------------- */
function hslToHex(h, s, l) {
  s /= 100; l /= 100
  const k = n => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('')
}
function hexToHsl(hex) {
  const c = cleanHex(hex) || '#30d158'
  const n = parseInt(c.slice(1), 16)
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h *= 60
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

function accentLabel(S) {
  const k = accentKey(S)
  return k === CUSTOM ? t('Your own color') : t(ACCENT_NAMES[k] || 'Green')
}

const fmtMBytes = bytes => (bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1) + ' MB'

/* ---------------- the page ---------------- */
const handlers = {}
for (const k of Object.keys(SWITCHES)) {
  handlers['sw_' + k] = function (e) {
    const v = !!(e && e.detail && e.detail.value)
    const d = SWITCHES[k]
    if (d.before) d.before(v)
    update(s => { d.set(s, v) })
    if (d.after) d.after(v)
  }
}
for (const k of Object.keys(SEGS)) {
  handlers['seg_' + k] = function (e) {
    const v = e && e.detail ? e.detail.value : undefined
    if (v === undefined) return
    SEGS[k].set(v)
  }
}

Page(connectPage(Object.assign({
  data: {
    page: '', L: {}, sw: {}, seg: {}, fc: {},
    effortOpen: false, effortRows: [],
    soundOpen: false, sounds: [],
    colorOpen: false, hsl: { h: 140, s: 63, l: 50 }, colorHex: '#30d158', colorInk: '#000000',
    zipOpen: false, zipText: '',
    mediaUsage: '', storageValue: '', storageSub: '',
  },

  mapState(S) {
    const page = this.pageId
    if (!page) return {}
    const out = { page, L: L() }
    const sw = {}
    for (const k of PAGE_SW[page] || []) sw[k] = !!SWITCHES[k].get(S)
    out.sw = sw
    const seg = {}
    for (const k of PAGE_SEG[page] || []) seg[k] = { options: SEGS[k].options(), value: SEGS[k].get(S) }
    out.seg = seg
    Object.assign(out, this.pageData(page, S))
    return out
  },

  pageData(page, S) {
    if (page === 'workout') {
      return {
        restValue: fmtRest(S.restSec),
        restPauseValue: fmtDuration(S.restPauseSec || 15),
        logRefValue: labelOf(LOGREF_OPTS(), S.logRef === 'best' ? 'best' : 'last'),
        wakeOK: wakeLockSupported(),
      }
    }
    if (page === 'advanced') {
      return { startFromValue: labelOf(STARTFROM_OPTS(), S.startFrom === 'last' ? 'last' : 'plan') }
    }
    if (page === 'alerts') {
      const canVibrate = vibrateSupported()
      const iPhone = appleTouchDevice()
      return {
        soundOn: !!S.sound,
        soundValue: t(REST_SOUND_LABEL[restSoundOf(S)]),
        showSilent: !!S.sound && playOnSilentSupported(),
        silentSub: t('Music playing on this phone stops during a workout and does not resume by itself.') + '\n' + t('iPhone only'),
        canVibrate,
        vibrateSub: canVibrate ? '' : iPhone ? t('Not on iPhone') : t('Not supported in this browser.'),
        vibrateFoot: !canVibrate && iPhone ? t('iPhone doesn’t let openGym vibrate. A sound or a flash does the job.') : '',
        sounds: this.soundList(S),
      }
    }
    if (page === 'plan') {
      const q = liveQueue(S)
      return {
        externalQ: externalQueue(S),
        externalText: t('Rotation') + ' · ' + t('Externally managed'),
        showBuildLoop: scheduleModeOf(S) === 'rotation' && !q,
      }
    }
    if (page === 'units') {
      return {
        enOnlyOn: (S.enOnly || {}).zh === true,
        formulaValue: labelOf(FORMULA_OPTS(), formulaOf(S)),
      }
    }
    if (page === 'equipment') {
      const profiles = S.equipProfiles || []
      const bells = dumbbellsOf(S)
      const active = profiles.find(p => p.id === S.activeEquipId)
      return {
        plateSummary: ownsPlates(S)
          ? inventoryFor(S).map(p => fmtPlate(p.w) + '×' + p.n).join(' · ') || t('None')
          : t('Standard set. Tap to count the pairs you own.'),
        dumbbellSummary: bells.length ? bells.map(fmtPlate).join(' · ') : t('Any weight. Tap to list the ones you own.'),
        hasProfiles: profiles.length > 0,
        activeProfileValue: active ? active.name : '',
        profiles: profiles.map(p => ({ id: p.id, name: p.name, sub: t('{0} equipment types', (p.equipment || []).length) })),
      }
    }
    if (page === 'look') {
      const key = accentKey(S)
      const own = cleanHex(S.accentCustom)
      const onCustom = key === CUSTOM
      const grey = own && isGrey(own)
      const notes = own && onCustom ? [
        adjustedIn(own, 'dark') && (grey ? t('Greys show lighter in dark mode, so buttons don’t look switched off.') : t('A touch lighter in dark mode, so you can still read it.')),
        adjustedIn(own, 'light') && (grey ? t('Greys show darker in light mode, so buttons don’t look switched off.') : t('A touch darker in light mode, so you can still read it.')),
      ].filter(Boolean) : []
      return {
        accentValue: accentLabel(S),
        swatches: Object.keys(ACCENTS).map(k => ({ k, c: ACCENTS[k], on: key === k })),
        own: own || '',
        ownOn: onCustom,
        ownInk: own ? inkOn(own) : '',
        // With a colour of its own that is not the accent now, a tap picks it again; otherwise
        // a tap opens the picker (to make one, or to change the one in use).
        ownPicks: !!own && !onCustom,
        accentNotes: notes,
      }
    }
    if (page === 'data') {
      const hasMedia = referencedFiles(S).length > 0
      return { hasMedia, exportSub: hasMedia ? t('Without photos and videos') : '' }
    }
    if (page === 'about') {
      return {
        versionValue: 'v' + APP_VERSION,
        versionLine: 'openGym v' + APP_VERSION + ' · ' + t('free & open source (AGPL v3)'),
      }
    }
    return {}
  },

  soundList(S) {
    const cur = restSoundOf(S)
    return REST_SOUND_IDS.map(id => ({
      id, on: id === cur, icon: id === cur ? 'speaker' : 'play',
      label: t(REST_SOUND_LABEL[id]), hint: REST_SOUND_HINT[id] ? t(REST_SOUND_HINT[id]) : '',
    }))
  },

  onLoad(query) {
    const id = query && query.page
    if (!id || !PAGES[id]) { navTo('/settings', { replace: true }); return }
    this.pageId = id
    wx.setNavigationBarTitle({ title: pageTitle(id) })
    const fc = {}
    for (const e of SEARCH) if (e.page === id) fc[e.id] = 'fk-' + e.id
    this.fcBase = fc
    this.__refresh()
    this.setData({ fc })
    if (query.find) setTimeout(() => this.flashRow(decodeURIComponent(query.find)), 350)
  },

  onShow() {
    if (this.pageId === 'data') this.loadUsage()
  },

  onUnload() {
    clearTimeout(this.flashTm)
  },

  // A search hit's row: scrolled to the middle of the screen and flashed once.
  flashRow(id) {
    if (!this.fcBase || !this.fcBase[id]) return
    const fc = Object.assign({}, this.fcBase, { [id]: this.fcBase[id] + ' sp-flash' })
    this.setData({ fc })
    clearTimeout(this.flashTm)
    this.flashTm = setTimeout(() => this.setData({ fc: this.fcBase }), 1900)
    const sel = '.fk-' + id
    const q = wx.createSelectorQuery().in(this)
    q.select(sel).boundingClientRect()
    q.select('>>> ' + sel).boundingClientRect()
    q.selectViewport().scrollOffset()
    q.exec(res => {
      const rect = (res && (res[0] || res[1])) || null
      const vp = res && res[2]
      if (!rect || !vp) return
      let h = 600
      try { h = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).windowHeight } catch (e) { /* default */ }
      wx.pageScrollTo({ scrollTop: Math.max(0, vp.scrollTop + rect.top - h / 2 + rect.height / 2), duration: 250 })
    })
  },

  /* ---------- workout ---------- */
  onRestTimer() {
    const S = st().S
    durationSheet({
      title: t('Rest timer'), value: S.restSec, max: REST_MAX, off: t('Off'),
      footer: t('Scroll to 0:00 to turn the rest timer off.'),
      onDone: v => update(s => { s.restSec = v }),
    })
  },
  onRestPause() {
    const S = st().S
    durationSheet({
      title: t('Rest-pause rest'), value: S.restPauseSec || 15, min: REST_PAUSE_MIN, max: REST_PAUSE_MAX,
      footer: t('The short break between the bursts of a rest-pause set.'),
      onDone: v => update(s => { s.restPauseSec = v }),
    })
  },
  onLogRef() {
    const S = st().S
    selectMenu(t('Shown under each exercise'), LOGREF_OPTS(), S.logRef === 'best' ? 'best' : 'last', v => update(s => { s.logRef = v }))
  },
  onEffortHelp() {
    this.setData({
      effortOpen: true,
      effortRows: EFFORT_ROWS.map(([rir, rpe, feel], i) => ({ rir, rpe, feel: t(feel), on: i === EFFORT_TYPICAL })),
    })
  },
  onEffortClose() { this.setData({ effortOpen: false }) },
  onAdvanced() { navTo('/settings/advanced') },

  /* ---------- fine-tuning ---------- */
  onStartFrom() {
    const S = st().S
    selectMenu(t('Planned sessions start from'), STARTFROM_OPTS(), S.startFrom === 'last' ? 'last' : 'plan', v => update(s => { s.startFrom = v }))
  },

  /* ---------- timer alerts ---------- */
  onSoundOpen() { this.setData({ soundOpen: true }) },
  onSoundClose() { this.setData({ soundOpen: false }) },
  // Every end-of-rest sound, each played as it is picked; the sheet stays open for the next one.
  onPickSound(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    unlock(true)
    update(s => { s.restSound = id; s.classicChime = id === 'classic' })
    chime(true, id)
  },

  /* ---------- plan ---------- */
  onBuildLoop() { navTo('/plan') },
  onStarter() { starterPlanSheet() },

  /* ---------- units ---------- */
  onFormula() {
    selectMenu(t('1RM formula'), FORMULA_OPTS(), formulaOf(st().S), v => update(s => { s.oneRmFormula = v }))
  },

  /* ---------- equipment ---------- */
  onPlates() { plateInventorySheet() },
  onDumbbells() { dumbbellInventorySheet() },
  onActiveProfile() {
    const S = st().S
    const opts = (S.equipProfiles || []).map(p => ({ value: p.id, label: p.name }))
    selectMenu(t('Active profile'), opts, S.activeEquipId || '', v => update(s => { s.activeEquipId = v }))
  },
  onProfile(e) {
    const p = (st().S.equipProfiles || []).find(x => x.id === e.currentTarget.dataset.id)
    if (p) equipmentProfileSheet(p)
  },
  onProfileDelete(e) {
    const p = (st().S.equipProfiles || []).find(x => x.id === e.currentTarget.dataset.id)
    if (!p) return
    confirmSheet({
      title: t('Delete profile?'), message: t('"{0}" and its equipment list will be removed.', p.name),
      confirmText: t('Delete'), danger: true,
      onConfirm: () => update(s => {
        s.equipProfiles = (s.equipProfiles || []).filter(x => x.id !== p.id)
        if (s.activeEquipId === p.id) s.activeEquipId = (s.equipProfiles[0] && s.equipProfiles[0].id) || null
      }),
    })
  },
  onAddProfile() { equipmentProfileSheet(null) },

  /* ---------- look ---------- */
  onSwatch(e) {
    const k = e.currentTarget.dataset.k
    if (!k || !ACCENTS[k]) return
    update(s => { s.accent = k })
    setRestAccent(k)
  },
  onOwnSwatch() {
    const S = st().S
    const own = cleanHex(S.accentCustom)
    if (own && accentKey(S) !== CUSTOM) { this.pickOwn(own); return }
    const hex = own || '#30d158'
    this.setData({ colorOpen: true, hsl: hexToHsl(hex), colorHex: hex, colorInk: inkOn(hex) })
  },
  pickOwn(hex) {
    const c = cleanHex(hex)
    const S = st().S
    if (!c || (accentKey(S) === CUSTOM && c === cleanHex(S.accentCustom))) return
    update(s => { s.accent = CUSTOM; s.accentCustom = c })
    setRestAccent(c)
  },
  onHue(e) { this.setHsl({ h: e.detail.value }) },
  onSat(e) { this.setHsl({ s: e.detail.value }) },
  onLight(e) { this.setHsl({ l: e.detail.value }) },
  setHsl(patch) {
    const hsl = Object.assign({}, this.data.hsl, patch)
    const hex = hslToHex(hsl.h, hsl.s, hsl.l)
    this.setData({ hsl, colorHex: hex, colorInk: inkOn(hex) })
  },
  onHexInput(e) {
    const c = cleanHex(String(e.detail.value || '').trim().replace(/^([0-9a-f]{6})$/i, '#$1'))
    if (c) this.setData({ hsl: hexToHsl(c), colorHex: c, colorInk: inkOn(c) })
  },
  onColorSave() {
    this.pickOwn(this.data.colorHex)
    this.setData({ colorOpen: false })
  },
  onColorClose() { this.setData({ colorOpen: false }) },

  /* ---------- data & backup ---------- */
  loadUsage() {
    const info = storage.info()
    if (info && info.limitSize) {
      this.setData({
        storageValue: fmtMBytes(info.currentSize * 1024) + ' / ' + fmtMBytes(info.limitSize * 1024),
        storageSub: '训练记录、计划和设置占用的本地缓存（上限 ' + fmtMBytes(info.limitSize * 1024) + '）',
      })
    }
    mediaStore.usage().then(u => {
      if (!u || !u.count) { this.setData({ mediaUsage: '' }); return }
      this.setData({ mediaUsage: t('Kept on this device only. Export with photos & videos keeps a copy.') + ' · ' + u.count + ' 个文件，' + fmtMBytes(u.bytes || 0) })
    }).catch(() => {})
  },

  // The whole profile as JSON, read at the moment of the tap (the store keeps it in several
  // storage keys, so never from storage), handed to the share-to-chat dialog.
  onExport() {
    const json = JSON.stringify(st().S, null, 2)
    const name = 'opengym-backup-' + todayISO() + '.json'
    saveAndShareFile(name, json).then(ok => { if (ok) toast(t('Backup exported')) })
  },

  // "Export with photos & videos": the JSON and every file it refers to, in a zip. Building it
  // takes a moment, after which the tap that shares it has to be a new one (wx.shareFileMessage
  // wants a user gesture), so a small sheet offers it.
  async onExportZip() {
    if (this.zipBusy) return
    this.zipBusy = true
    wx.showLoading({ title: '正在打包…', mask: true })
    let out = null
    try { out = await exportBackupZip(st().S) } catch (e) { out = null }
    wx.hideLoading()
    this.zipBusy = false
    if (!out) { toast(t('Something went wrong')); return }
    const name = 'opengym-backup-' + todayISO() + '.zip'
    const path = wx.env.USER_DATA_PATH + '/' + name
    try { wx.getFileSystemManager().writeFileSync(path, out.data) } catch (e) { toast('无法保存文件。'); return }
    this.zip = { path, name, missing: out.missing }
    this.setData({
      zipOpen: true,
      zipText: name + (out.missing ? ' · ' + tn('{0} file could not be included', '{0} files could not be included', out.missing) : ''),
    })
  },
  onShareZip() {
    const z = this.zip
    if (!z) return
    wx.shareFileMessage({
      filePath: z.path, fileName: z.name,
      success: () => { this.setData({ zipOpen: false }); if (!z.missing) toast(t('Backup exported')) },
      fail: () => {},
    })
  },
  onZipClose() { this.setData({ zipOpen: false }) },

  // Import takes the JSON backup and the zip alike, told apart by their first bytes. A zip's
  // files go into the local store only once the import is confirmed.
  async onImport() {
    const f = await pickFile({ extension: ['json', 'zip'] })
    if (!f) return
    let read
    try {
      const data = wx.getFileSystemManager().readFileSync(f.path)
      read = await readBackupFile(data)
    } catch (e) { toast(backupImportError(e)); return }
    confirmSheet({
      title: t('Import backup?'), message: t('This replaces all current data with the backup file.'), confirmText: t('Import'), danger: true,
      onConfirm: async () => {
        if (read.files.length) { try { await storeBackupMedia(read.files) } catch (e) { /* the state still imports */ } }
        st().importBackup(read.state)
        toast(t('Backup imported'))
      },
    })
  },
  onImportApp() { importFromApp() },
  onHevy() { importFromHevy() },

  // Reset everything: a new profile, then the photos and videos on this device go too.
  onReset() {
    confirmSheet({
      title: t('Reset everything?'),
      message: t('Deletes your plan, workouts, body weight, photos and videos on this device. This cannot be undone.'),
      confirmText: t('Delete everything'), danger: true,
      onConfirm: () => {
        st().resetEverything()
        navTo('/home')
        toast(t('All data reset'))
        mediaStore.retainOnly(new Set()).catch(() => {})
      },
    })
  },

  /* ---------- about ---------- */
  onSource() {
    copyText(REPO_URL).then(ok => { if (ok) toast(t('Copied')) })
  },
}, handlers)))
