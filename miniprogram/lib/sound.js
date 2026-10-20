// Beeps + haptics. MINI PROGRAM PORT: the web app synthesised every tone live with Web Audio; a
// mini program has no AudioContext, so each tone is a short pre-rendered wav in assets/sounds/
// (rendered by tools/gen-sounds.mjs from the very numbers below and in rest-sounds.js) played
// through wx.createInnerAudioContext. Vibration goes through wx.vibrateShort / wx.vibrateLong.
//
// Every export keeps the web app's name and arguments. Nothing touches `wx` until a sound is
// played, so the module also loads under Node (vitest).
import { REST_SOUNDS, REST_SOUND_IDS } from './rest-sounds.js'

const hasWx = () => typeof wx !== 'undefined' && wx

// Timbres richer than a sine, as the strengths of the fundamental and its harmonics (`bright`
// for the chime, `bell` for the ding-dong). Read by tools/gen-sounds.mjs when it renders the
// wav files; kept here, as in the web app, so the numbers stay in one place.
export const TIMBRES = { bright: [1, 0.6, 0.35, 0.2], bell: [1, 0.25, 0.5, 0.1, 0.3] }

// Every beep() the app makes, as [freq, dur]: the 3-2-1 countdown (660), a set tick (1040) and
// the finish fanfare (880, 1100, 1320). Each has a wav of its own; a beep that is none of these
// plays the nearest one by pitch.
export const BEEPS = [[660, 0.1], [880, 0.15], [880, 0.18], [1040, 0.12], [1100, 0.15], [1320, 0.3]]
export const SOUND_DIR = '/assets/sounds/'
export const beepFile = (freq, dur) => `beep-${Math.round(freq)}-${Math.round(dur * 1000)}.wav`
export const chimeFile = id => `rest-${id}.wav`

// The file a beep(freq, dur) plays: the exact one when it exists, otherwise the closest pitch.
export function beepSrc(freq = 880, dur = 0.18) {
  let best = BEEPS[0], bestD = Infinity
  for (const b of BEEPS) {
    const d = Math.abs(b[0] - freq) * 10 + Math.abs(b[1] - dur) * 1000
    if (d < bestD) { bestD = d; best = b }
  }
  return SOUND_DIR + beepFile(best[0], best[1])
}

// One InnerAudioContext per file, created on first use and reused (stop + play restarts it).
// A handful of files at most, so the pool never grows past that; disposeSounds() frees them.
const pool = new Map()
function ctxFor(src) {
  let a = pool.get(src)
  if (a) return a
  const w = hasWx()
  if (!w || typeof w.createInnerAudioContext !== 'function') return null
  a = w.createInnerAudioContext()
  a.src = src
  try { a.onError && a.onError(() => { /* a missing or undecodable file: stay silent */ }) } catch (e) { /* */ }
  pool.set(src, a)
  return a
}
const playNow = src => {
  try {
    const a = ctxFor(src)
    if (!a) return
    try { a.stop() } catch (e) { /* not playing */ }
    a.play()
  } catch (e) { /* */ }
}
const playAt = (src, when) => {
  if (when > 0) setTimeout(() => playNow(src), Math.round(when * 1000))
  else playNow(src)
}

export function disposeSounds() {
  pool.forEach(a => { try { a.destroy() } catch (e) { /* */ } })
  pool.clear()
}

export function beep(enabled, freq, dur, when) {
  if (!enabled) return
  try { playAt(beepSrc(freq || 880, dur || 0.18), when || 0) } catch (e) { /* */ }
}

// The end of a rest or a hold (store/ui.js). See the web app's lib/sound.js for why the chime
// sounds the way it does; here it is the rendered file of the chosen REST_SOUNDS entry.
export { CHIME_PEAK, REST_SOUNDS, REST_SOUND_IDS, restSoundOf } from './rest-sounds.js'
// `kind` is a REST_SOUNDS id; `true` (the old "classic" switch) still means the classic beeps.
export function chime(enabled, kind) {
  if (!enabled) return
  const id = kind === true ? 'classic' : kind
  const key = Object.hasOwn(REST_SOUNDS, id) ? id : 'chime'
  try { playNow(SOUND_DIR + chimeFile(key)) } catch (e) { /* */ }
}

// The web app started its AudioContext inside a tap. An InnerAudioContext needs no such gesture;
// this only warms the pool so the first tone does not wait for the context to be made.
export function unlock(enabled) {
  if (!enabled) return
  try { ctxFor(beepSrc(660, 0.1)) } catch (e) { /* */ }
}

const platform = () => {
  const w = hasWx()
  if (!w) return ''
  try {
    const info = typeof w.getDeviceInfo === 'function' ? w.getDeviceInfo() : w.getSystemInfoSync()
    return String((info && info.platform) || '').toLowerCase()
  } catch (e) { return '' }
}

// Settings → "Play sounds when the phone is on silent". Only iOS has a mute switch that mutes a
// mini program's audio (wx.setInnerAudioOption obeyMuteSwitch is iOS-only), so it is offered there.
export const playOnSilentSupported = () => platform() === 'ios'
// An iPhone or iPad.
export const appleTouchDevice = () => platform() === 'ios'
export function setPlayOnSilent(on) {
  const w = hasWx()
  if (!w || typeof w.setInnerAudioOption !== 'function') return
  try { w.setInnerAudioOption({ obeyMuteSwitch: !on, mixWithOther: true, fail() {} }) } catch (e) { /* */ }
}

// Settings → "Vibrate": a page-level switch, on by default.
let buzz = true
export function setVibrate(on) { buzz = on !== false }
// wx.vibrateShort / vibrateLong work on both iOS and Android (unlike navigator.vibrate on iOS).
export const vibrateSupported = () => {
  const w = hasWx()
  return !!w && typeof w.vibrateShort === 'function'
}

// wx.vibrateShort lasts ~15ms and takes a strength; wx.vibrateLong lasts 400ms. A navigator.vibrate
// pattern ([on, off, on…] or one duration, ms) becomes a series of those: an "on" of 100ms or more
// is a long buzz, anything shorter a short one (light / medium / heavy by length). Each starts at
// its place in the pattern, but never before the previous long buzz has ended.
const LONG_MS = 400
export function vibrationPlan(p) {
  const list = Array.isArray(p) ? p : [p]
  const out = []
  let at = 0, free = 0
  list.forEach((ms, i) => {
    const d = Number(ms)
    if (!Number.isFinite(d) || d <= 0) return
    if (i % 2 === 0) {
      const start = Math.max(at, free)
      if (d >= 100) { out.push({ at: start, kind: 'long' }); free = start + LONG_MS }
      else { out.push({ at: start, kind: 'short', type: d < 10 ? 'light' : d <= 20 ? 'medium' : 'heavy' }); free = start + 15 }
    }
    at += d
  })
  return out
}
const buzzOnce = step => {
  const w = hasWx()
  if (!w) return
  try {
    if (step.kind === 'long') w.vibrateLong && w.vibrateLong({ fail() {} })
    else w.vibrateShort && w.vibrateShort({ type: step.type, fail() {} })
  } catch (e) { /* */ }
}
export function vibrate(p) {
  if (!buzz) return
  try {
    for (const step of vibrationPlan(p)) {
      if (step.at > 0) setTimeout(() => buzzOnce(step), step.at)
      else buzzOnce(step)
    }
  } catch (e) { /* */ }
}

// Settings → "Vibrate when the phone is on silent" (#375). In the web app a native alarm buzzer
// could be handed in; the mini program has none (lib/rest-alert.js buzzAsAlarm answers false), so
// the ordinary buzz stands in unless something is set here.
let alarmBuzzer = null
export function setAlarmBuzzer(fn) { alarmBuzzer = typeof fn === 'function' ? fn : null }
export function alertBuzz(p) {
  if (!buzz) return
  const native = alarmBuzzer
  if (!native) { vibrate(p); return }
  let asked
  try { asked = Promise.resolve(native(p)) } catch (e) { asked = Promise.resolve(false) }
  asked.then(ok => { if (!ok) vibrate(p) }, () => vibrate(p))
}

// For tools/gen-sounds.mjs: every file this module may play.
export const SOUND_FILES = () => [
  ...BEEPS.map(([f, d]) => beepFile(f, d)),
  ...REST_SOUND_IDS.map(chimeFile),
]
