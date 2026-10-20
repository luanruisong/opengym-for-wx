// Formatting + date helpers (ported from the vanilla app, unit taken from the store where needed).
import { getLang, t, tn, exerciseNameFor, exerciseNameClass } from './i18n-core.js'

// MINI PROGRAM: no Intl / toLocale* (the Android JS engine's Intl is unreliable). Dates,
// numbers and relative times are formatted by hand: Chinese when the UI is in Chinese (the only
// language this build ships), en-GB style otherwise (what the English-language tests expect —
// the same output Intl gave the web app).
const zh = () => getLang() === 'zh' || getLang() === 'zh-TW'
const WEEK_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** 周一…周日 for a getDay() index. */
export const weekdayShort = day => (zh() ? WEEK_ZH : WEEK_EN)[((day % 7) + 7) % 7]

// A number with thousands separators and at most `max` decimals (trailing zeros dropped), the
// way toLocaleString(…, { maximumFractionDigits }) printed it: 1,234,567.5.
export function groupNum(n, max = 3, min = 0) {
  if (typeof n !== 'number' || !isFinite(n)) return String(n)
  const p = Math.pow(10, max)
  const r = Math.round(Math.abs(n) * p) / p
  let [int, frac = ''] = r.toFixed(max).split('.')
  frac = frac.replace(/0+$/, '')
  while (frac.length < min) frac += '0'
  int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const neg = n < 0 && (Number(int.replace(/,/g, '')) > 0 || Number(frac) > 0)
  return (neg ? '-' : '') + int + (frac ? '.' + frac : '')
}

export const todayISO = () => {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
export const isoOf = d =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')

export const DAYN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function fmtDate(iso, long, withYear = false) {
  const d = new Date(iso + 'T12:00:00')
  if (isNaN(d.getTime())) return String(iso || '')
  const day = d.getDate(), mon = d.getMonth(), wd = d.getDay(), y = d.getFullYear()
  // zh-CN: 2026年2月3日周二 / 2月3日 周二; en-GB: Tue, 3 Feb 2026 / Tue 3 Feb
  if (zh()) return (withYear ? y + '年' : '') + (mon + 1) + '月' + day + '日' + (long ? ' ' + WEEK_ZH[wd] : '')
  const date = day + ' ' + MON_EN[mon] + (withYear ? ' ' + y : '')
  return long ? WEEK_EN[wd] + (withYear ? ', ' : ' ') + date : date
}
// A span of days, e.g. an import's first and last workout. The year is shown when the span
// crosses one or lies outside the current year: "3 Feb – 21 Dec" over two years read as one.
export function fmtDateRange(from, to, long, now = new Date()) {
  if (!from) return ''
  const last = to || from
  const year = String(now.getFullYear())
  const withYear = from.slice(0, 4) !== last.slice(0, 4) || from.slice(0, 4) !== year
  return from === last ? fmtDate(from, long, withYear) : fmtDate(from, long, withYear) + ' – ' + fmtDate(last, long, withYear)
}
// In the UI language: the Latin h, m and min stood inside Arabic and Ukrainian rows.
export function fmtDur(ms) {
  const m = Math.floor(ms / 60000)
  return m >= 60 ? t('{0}h {1}m', Math.floor(m / 60), m % 60) : t('{0} min', m)
}
// Imported history has no clock — an unknown duration is left out rather than shown as "0 min".
export const durPart = ms => (ms >= 60000 ? [fmtDur(ms)] : [])
// Numbers follow the UI language, like the dates above — a hardcoded locale put Swiss
// apostrophes ("7'535 kg") in front of every user, in every language.
// Exercise names are stored lower-case and shown through CSS `capitalize`; text that has no
// element of its own (a toast) capitalises here instead.
export const capWords = s => String(s || '').replace(/(^|[\s(\-\/])(\p{Ll})/gu, (m, pre, ch) => pre + ch.toUpperCase())
// An exercise's display name as plain text, cased the way its element would be on screen
// (exerciseNameClass): for a toast, a dialog title or a picker label, which have no element of
// their own to put the class on.
export const exerciseNameText = ex => (exerciseNameClass(ex) ? capWords(exerciseNameFor(ex)) : exerciseNameFor(ex))
/* How many decimals a weight is shown with. One is enough for plate-loadable numbers, but a
 * per-side figure from kg plates lands on .25 and .75 and reading those as .3 and .8 is the
 * complaint in issue #139 — as is microplate work. The setting is read here rather than passed
 * through sixty-odd call sites, the same way the date locale is; App.jsx pushes it whenever
 * `S.wdec` changes.
 *
 * It only ever adds precision that is really there: a whole number still prints whole, and
 * 62.5 is 62.5 either way. Nothing rounds differently in storage — this is display only.
 */
let decimals = 1
export const setWeightDecimals = n => { decimals = n === 2 ? 2 : 1 }
export const weightDecimals = () => decimals
export const fmtNum = n => {
  const p = decimals === 2 ? 100 : 10
  return groupNum(Math.round(n * p) / p, decimals)
}
// Plate sizes keep their quarter: 1.25 and 21.25 are real numbers on a plate and a bar.
export const fmtPlate = n => groupNum(Math.round(n * 100) / 100, 3)
// Volume stays in the profile's unit throughout: the old shorthand turned anything over
// 10 000 into "t", which is wrong for a pound profile and made one list mix "18.8t" with
// "7'535 kg" — two numbers you can't compare at a glance.
export const fmtVol = (v, unit) => fmtNum(v) + ' ' + unit
// Plural forms come from the pack via tn(): three forms in Russian, two in English.
export const exCount = n => tn('{0} exercise', '{0} exercises', n)
export const routineCount = n => tn('{0} routine', '{0} routines', n)
export const changeCount = n => tn('{0} change', '{0} changes', n)
// The Sets tile of the finish summary: all the sets logged, then how many of them were work sets.
export const setsWorkCount = (n, work) => tn('{0} set · {1} work', '{0} sets · {1} work', n, work)

// `n` units ago, as Intl.RelativeTimeFormat(…, { numeric: 'auto' }).format(-n, unit) said it.
const UNIT_ZH = { second: '秒钟', minute: '分钟', hour: '小时', day: '天', week: '周', month: '个月', year: '年' }
const AUTO_ZH = { second: ['现在'], minute: [null], hour: [null], day: ['今天', '昨天', '前天'], week: ['本周', '上周'], month: ['本月', '上个月'], year: ['今年', '去年'] }
const AUTO_EN = { second: ['now'], day: ['today', 'yesterday'], week: ['this week', 'last week'], month: ['this month', 'last month'], year: ['this year', 'last year'] }
export function relTime(n, unit) {
  if (zh()) return (AUTO_ZH[unit] && AUTO_ZH[unit][n]) || n + UNIT_ZH[unit] + '前'
  return (AUTO_EN[unit] && AUTO_EN[unit][n]) || (n + ' ' + unit + (n === 1 ? '' : 's') + ' ago')
}

// "5 minutes ago", "yesterday", "now" — in the UI language, from the platform's own rules
// (Intl.RelativeTimeFormat), so no pack has to carry a word for every unit and plural. Used for
// when this device last synced; a time in the future (a clock set back since) reads as now.
export function fmtAgo(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  const [n, unit] = s < 60 ? [0, 'second'] : s < 3600 ? [Math.floor(s / 60), 'minute'] : s < 86400 ? [Math.floor(s / 3600), 'hour'] : [Math.floor(s / 86400), 'day']
  return relTime(n, unit)
}

// How long before `dayIso` a logged day was, in calendar days (#363): "yesterday", "3 days ago",
// "2 weeks ago", "last month". For the "Last time (…)" line of a workout, so `dayIso` is the
// session's own day, not the wall clock: a workout logged into the past counts back from its
// day. Whole calendar days at noon, so a DST weekend between the two is not a day short.
// The words come from Intl.RelativeTimeFormat, so no pack carries them; it has no compound form
// ("1 week 1 day ago"), which is why a span rounds down to its coarsest unit. A year or more
// back reads as the date with its year, which says more than "1 year ago". A day after `dayIso`
// (a clock set back) reads as today.
export function fmtDaysAgo(iso, dayIso = todayISO()) {
  const at = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
  const days = Math.max(0, Math.round((at(dayIso) - at(iso)) / 86400000))
  if (!(days >= 0)) return fmtDate(iso)
  if (days >= 365) return fmtDate(iso, false, true)
  const [n, unit] = days < 7 ? [days, 'day'] : days < 35 ? [Math.floor(days / 7), 'week'] : [Math.max(1, Math.floor(days / 30.44)), 'month']
  return relTime(n, unit)
}

/* ---------------------------------------------------------------- week start --
   Where a week begins is a local convention, not a fact: most of Europe starts on
   Monday, most of the Americas and much of Asia on Sunday. The app used to assume
   Monday everywhere — the Plan list, the Home strip, the calendar grid and every
   "this week" total. It is now S.weekStart, a getDay() index, and every one of those
   places asks these helpers instead of writing the assumption down again.

   Only 1 and 0 are offered in the UI, but the helpers work for any weekday, so a
   Saturday start (parts of the Middle East) would need a locale string and nothing
   else. */
export const MONDAY = 1
export const SUNDAY = 0
/** The profile's first weekday, defaulting to Monday for every state written before this. */
export const weekStartOf = S => (S?.weekStart === SUNDAY ? SUNDAY : MONDAY)
/** getDay() indices in display order — [1..6,0] for a Monday start, [0..6] for a Sunday one. */
export const weekOrder = (ws = MONDAY) => Array.from({ length: 7 }, (_, i) => (ws + i) % 7)
/** How many days a weekday sits past the start of its week. 0..6, so it doubles as a column. */
export const weekDayOffset = (day, ws = MONDAY) => (day - ws + 7) % 7

/** The Date (noon local, so DST cannot shift the day) that starts the week `iso` falls in. */
export function startOfWeek(iso, ws = MONDAY) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() - weekDayOffset(d.getDay(), ws))
  return d
}

/**
 * A key that is equal for two dates in the same week: the ISO date of the week's first day.
 *
 * Only ever compared or used as a map key — never shown, never stored — so it does not need
 * to be an ISO week number, and being one would be a liability here: "2026-35" is defined
 * Monday-first, and there is no Sunday-first equivalent to fall back to.
 */
export const weekKey = (iso, ws = MONDAY) => isoOf(startOfWeek(iso, ws))

// No Intl: an IANA name from the UTC offset (China's +8 as Asia/Shanghai, else Etc/GMT∓N).
export const localTZ = () => {
  const off = -new Date().getTimezoneOffset() / 60
  if (off === 8) return 'Asia/Shanghai'
  if (off === 0) return 'UTC'
  return Number.isInteger(off) ? 'Etc/GMT' + (off > 0 ? '-' : '+') + Math.abs(off) : 'UTC'
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
// What each accent is called, for a screen reader (Settings' swatches carry no text).
export const ACCENT_NAMES = { lime: 'Green', sky: 'Blue', orange: 'Orange', violet: 'Purple', pink: 'Pink', red: 'Red', teal: 'Teal', gold: 'Yellow' }
export const ACCENTS = { lime: '#30d158', sky: '#0a84ff', orange: '#ff9f0a', violet: '#bf5af2', pink: '#ff375f', red: '#ff453a', teal: '#40c8e0', gold: '#ffd60a' }
// Text drawn on top of that swatch. Matches the --on-acc values in index.css.
export const ACCENT_INK = { lime: '#000000', sky: '#ffffff', orange: '#000000', violet: '#ffffff', pink: '#ffffff', red: '#ffffff', teal: '#000000', gold: '#000000' }
// Android color int, opaque. JS bitwise ops are signed, so the high bit is cleared back to unsigned.
export const argb = hex => (0xff000000 | parseInt(hex.slice(1), 16)) >>> 0