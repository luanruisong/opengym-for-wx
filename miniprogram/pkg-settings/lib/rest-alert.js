// Rest-over alert. MINI PROGRAM: there is no native alarm (the Capacitor app scheduled one); a
// mini program cannot ring while in the background, so every native call below is a no-op that
// answers "not delivered" and the in-page countdown (store/ui.js) plays the tone itself.
// buildRestAlert stays as the pure description of the alert (and keeps its tests).
//
// Original notes, for reference:
// Rest-over alert for the Capacitor app.
//
// The in-page countdown is a setInterval in the WebView. Android freezes that as soon as the
// screen locks, so the beep never runs and nothing is posted. Scheduling a real alarm at
// startRest() is what still fires with the screen off: the receiver posts the notification
// and plays the end tone. The card in the notification shade is the in-app shape: clock plus
// a shrinking bar. The lock screen shows it only when notifications are allowed and the
// system is set to show them there.
//
// The web build keeps Web Push (useUI). This file no-ops there; MOBILE is a build-time flag.
import { t } from '../../lib/i18n-core.js'
import { argb } from '../../lib/format.js'
import { accentPair } from '../../lib/accent.js'
import { REST_SOUNDS } from '../../lib/rest-sounds.js'

export const REST_ALERT_ID = 42
export const REST_CHANNEL_ID = 'rest-over'
// Settings → Vibrate off. A notification channel's vibration is the system's to keep once the
// channel exists, so the app cannot switch it off on 'rest-over': an end that must not buzz is
// posted on a second channel that never vibrates (RestAlert.java).
export const REST_QUIET_CHANNEL_ID = 'rest-over-quiet'

// One object the native side schedules. Public + high is what the notification shade can show.
// The lock screen follows the user's notification settings.
// `key` is a preset's key or the user's own colour as '#rrggbb' (lib/accent.js accentValue).
export function accentColors(key) {
  const { accent, ink } = accentPair(key)
  return { accent: argb(accent), ink: argb(ink) }
}

export function buildRestAlert({ at, title, countdownTitle, totalSec, accent, sound = true, classic = false, tone = null, vibrate = true, alarmBuzz = false, now = Date.now() } = {}) {
  if (typeof at !== 'number' || !(at > now)) return null
  // Settings → Sound (#306): one of lib/sound.js REST_SOUNDS; without one, `classic` decides, as before.
  const kind = Object.hasOwn(REST_SOUNDS, tone) ? tone : classic === true ? 'classic' : 'chime'
  const totalMs = Math.max(1000, Math.round((totalSec > 0 ? totalSec : (at - now) / 1000) * 1000))
  const colors = accentColors(accent)
  return {
    id: REST_ALERT_ID,
    channelId: vibrate ? REST_CHANNEL_ID : REST_QUIET_CHANNEL_ID,
    title: title || t('Rest’s over. Next set!'),
    countdownTitle: countdownTitle || t('Rest'),
    pause: t('Pause'),
    resume: t('Resume'),
    minus: '− 15s',
    plus: '+ 15s',
    skip: t('Skip'),
    accent: colors.accent,
    ink: colors.ink,
    totalMs,
    at,
    allowWhileIdle: true,
    sound: !!sound,
    // Settings → Sound: the native side plays the same end tone the page does (RestTone.java).
    // `tone` names it; `classic` stays for an app shell from before #306, which reads only that
    // and plays the chime for every other pick.
    tone: kind,
    classic: kind === 'classic',
    vibrate: !!vibrate,
    // Settings → "Vibrate when the phone is on silent" (#375): the end buzzes as an alarm, which
    // silent mode lets through, instead of through the notification channel, which it mutes.
    alarmBuzz: !!vibrate && !!alarmBuzz,
    localOnly: false,
    visibility: 'public',
    importance: 'high',
  }
}

// Resolves true only when a native alarm was scheduled: never, in the mini program.
export function armRestAlert(at, opts = {}) { return Promise.resolve(false) }
export function disarmRestAlert() {}
export function holdRestAlert(leftSec, totalSec) {}

// What the notification's own buttons did; the mini program has no such notification.
let onNativeRest = null
export function bindNativeRest(cb) { onNativeRest = cb }

// Native alarm buzz / tone: not available, the caller buzzes / chimes the ordinary way.
export function buzzAsAlarm(pattern) { return Promise.resolve(false) }
export function toneNative(kind) { return Promise.resolve(false) }
export function setRestAccent(key) {}

export const NOTIF_ASKED_KEY = 'gym_rest_notif_asked'
export function askNotifPermissionOnce() { return Promise.resolve(false) }
export function _resetNotifAsk() {}
