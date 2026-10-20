// Theme: the web app's :root custom properties (frontend/src/index.css, lib/accent.js), as a
// style string for the page's root view and as plain colours for canvas drawing.
//
//   themeStyle(S)   → '--bg:#000000;--surface:#1c1c1e;…;--acc:#30d158;…'  (page.js puts it in
//                     this.data.theme; <view class="page" style="{{theme}}"> applies it, and custom
//                     properties inherit into every component on the page)
//   themeColors(S)  → { bg, surface, label, label2, …, acc, accSoft, …, dark }  for canvas charts
//   themeName(S)    → 'dark' | 'light'   (S.theme 'system' resolved against the OS)
//   applyChrome(S)  → navigation bar / window background / pull-down text style for the theme
//
// WXSS has no :root[data-theme] and no reliable color-mix() on older Android WebViews, so
// everything index.css derives with color-mix() is precomputed here into its own variable
// (--acc-soft, --red-soft, --hm-1…, see DERIVED below). Results are cached per (theme, accent).
import { accentValue, customAccentVars } from '../lib/accent.js'

const BASE = {
  dark: {
    bg: '#000000', bgEl: '#0e0e10', surface: '#1c1c1e', surface2: '#2c2c2e', surface3: '#3a3a3c',
    label: '#ffffff', label2: 'rgba(235,235,245,0.6)', label3: 'rgba(235,235,245,0.32)', label4: 'rgba(235,235,245,0.18)',
    sep: 'rgba(84,84,88,0.6)', sepOp: 'rgba(84,84,88,0.34)',
    blue: '#0a84ff', green: '#30d158', red: '#ff453a', orange: '#ff9f0a', yellow: '#ffd60a', teal: '#40c8e0',
    indigo: '#5e5ce6', pink: '#ff375f', purple: '#bf5af2', mint: '#63e6e2', brown: '#ac8e68', grey: '#8e8e93',
    // light-only overrides of index.css, as variables
    fillSearch: '#2c2c2e', segSel: '#1c1c1e', tabbarBg: 'rgba(14,14,16,0.94)', sheetBg: '#0e0e10',
  },
  light: {
    bg: '#f2f2f7', bgEl: '#f7f7fa', surface: '#ffffff', surface2: '#ececef', surface3: '#e3e3e8',
    label: '#000000', label2: 'rgba(60,60,67,0.6)', label3: 'rgba(60,60,67,0.3)', label4: 'rgba(60,60,67,0.16)',
    sep: 'rgba(60,60,67,0.29)', sepOp: 'rgba(60,60,67,0.2)',
    blue: '#007aff', green: '#34c759', red: '#ff3b30', orange: '#ff9500', yellow: '#ffcc00', teal: '#30b0c7',
    indigo: '#5856d6', pink: '#ff2d55', purple: '#af52de', mint: '#00c7be', brown: '#a2845e', grey: '#8e8e93',
    fillSearch: 'rgba(118,118,128,0.12)', segSel: '#ffffff', tabbarBg: 'rgba(249,249,251,0.94)', sheetBg: '#f2f2f7',
  },
}

// index.css :root[data-accent=…]: the accent is one of the theme's system colours.
const PRESETS = {
  lime: { c: 'green', acc2: '#248a3d', on: '#000000' },
  sky: { c: 'blue', acc2: '#0060df', on: '#ffffff' },
  orange: { c: 'orange', acc2: '#c76b00', on: '#000000' },
  violet: { c: 'purple', acc2: '#8944ab', on: '#ffffff' },
  pink: { c: 'pink', acc2: '#d70036', on: '#ffffff' },
  red: { c: 'red', acc2: '#d70015', on: '#ffffff' },
  teal: { c: 'teal', acc2: '#0071a4', on: '#000000' },
  gold: { c: 'yellow', acc2: '#b25000', on: '#000000', ring: 'rgba(0,0,0,0.28)' },
}

/* ---------- colour helpers ---------- */
function parse(c) {
  if (c[0] === '#') {
    const n = parseInt(c.slice(1), 16)
    return [n >> 16, (n >> 8) & 255, n & 255, 1]
  }
  const m = c.match(/rgba?\(([^)]+)\)/)
  const p = m ? m[1].split(',').map(Number) : [0, 0, 0, 1]
  return [p[0], p[1], p[2], p[3] == null ? 1 : p[3]]
}
const r3 = v => Math.round(v * 1000) / 1000
const toCss = ([r, g, b, a]) => {
  if (a >= 1) return '#' + [r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${r3(a)})`
}
// color-mix(in srgb, a p, b) for opaque `b`, or `b` = 'transparent'.
export function mixColor(a, p, b = 'transparent') {
  const A = parse(a)
  if (b === 'transparent') return toCss([A[0], A[1], A[2], A[3] * p])
  const B = parse(b)
  // a translucent `a` (the --label-n greys) is first flattened onto `b`
  const pa = p * A[3]
  return toCss([A[0] * pa + B[0] * (1 - pa), A[1] * pa + B[1] * (1 - pa), A[2] * pa + B[2] * (1 - pa), 1])
}

/* ---------- theme resolution ---------- */
export function systemTheme() {
  try {
    const info = wx.getAppBaseInfo ? wx.getAppBaseInfo() : wx.getSystemInfoSync()
    if (info && info.theme === 'light') return 'light'
  } catch (e) { /* older base library */ }
  return 'dark'
}

// The timer flash (components/timer-flash) blinks the app into the other theme for a moment.
let override = null
export function setThemeOverride(name) { override = name === 'light' || name === 'dark' ? name : null }

/** The theme as drawn: 'dark' or 'light'. */
export function themeName(S) {
  if (override) return override
  return savedTheme(S)
}

/** The user's theme, resolved, ignoring a running flash. */
export function savedTheme(S) {
  const t = S && S.theme
  return t === 'light' || t === 'dark' ? t : t === 'system' ? systemTheme() : 'dark'
}

function accentOf(S) {
  try { return accentValue(S || {}) } catch (e) { return 'lime' }
}

const cache = new Map()

function build(theme, accent) {
  const B = BASE[theme]
  const c = Object.assign({ dark: theme === 'dark' }, B)
  const custom = typeof accent === 'string' && accent[0] === '#' ? customAccentVars(accent, theme) : null
  if (custom) {
    c.acc = custom['--acc']; c.acc2 = custom['--acc-2']; c.onAcc = custom['--on-acc']; c.knobRing = custom['--knob-ring']
  } else {
    const p = PRESETS[accent] || PRESETS.lime
    c.acc = B[p.c]; c.acc2 = p.acc2; c.onAcc = p.on; c.knobRing = p.ring || 'transparent'
  }
  // DERIVED: what index.css mixed with color-mix()
  Object.assign(c, {
    accSoft: mixColor(c.acc, 0.16),
    accLine: mixColor(c.acc, 0.38),
    accShadow: mixColor(c.acc, 0.55),
    accFlash: mixColor(c.acc, 0.28, B.surface),
    onAccDim: mixColor(c.onAcc, 0.62),
    redSoft: mixColor(B.red, 0.15),
    redPane: mixColor(B.red, 0.22, B.surface),
    orangeSoft: mixColor(B.orange, 0.14),
    orangeShadow: mixColor(B.orange, 0.55),
    yellowSoft: mixColor(B.yellow, 0.18),
    yellowCard: mixColor(B.yellow, 0.16, B.surface),
    greenDone: mixColor(B.green, 0.7, B.surface),
    orangePartial: mixColor(B.orange, 0.45, B.surface),
    labelTint: mixColor(B.label, 0.1),
    bgGlass: mixColor(B.bg, 0.94),
    surfaceGlass: mixColor(B.surface, 0.97),
    surface2Glass: mixColor(B.surface2, 0.88),
    hm1: mixColor(c.acc, 0.3, B.surface2),
    hm2: mixColor(c.acc, 0.55, B.surface2),
    hm3: mixColor(c.acc, 0.78, B.surface2),
  })
  c.bmBase = mixColor(B.label, 0.11, B.surface)
  c.bmSil = mixColor(B.label, 0.18, B.surface)
  c.bm1 = mixColor(c.acc, 0.32, c.bmBase)
  c.bm2 = mixColor(c.acc, 0.56, c.bmBase)
  c.bm3 = mixColor(c.acc, 0.78, c.bmBase)
  const kebab = k => '--' + k.replace(/([a-z])([A-Z0-9])/g, '$1-$2').replace(/([0-9])([a-z])/gi, '$1-$2').toLowerCase()
  let style = ''
  for (const k of Object.keys(c)) if (k !== 'dark') style += kebab(k) + ':' + c[k] + ';'
  style += 'color:' + c.label + ';background-color:' + c.bg + ';'
  return { colors: c, style }
}

function get(S) {
  const theme = themeName(S)
  const accent = accentOf(S)
  const key = theme + '|' + accent
  let v = cache.get(key)
  if (!v) { v = build(theme, accent); cache.set(key, v) }
  return v
}

/** CSS custom properties for the page root (style="{{theme}}"). */
export function themeStyle(S) { return get(S).style }

/** The same palette as plain colour strings, for canvas. */
export function themeColors(S) { return get(S).colors }

let lastChrome = ''
/** Navigation bar, window background and pull-down text style for S's theme. */
export function applyChrome(S) {
  const { colors: c } = get(S)
  const key = c.dark ? 'd' : 'l'
  // setNavigationBarColor applies to the current page only, so it runs on every onShow;
  // the window-level calls only when the theme changed.
  wx.setNavigationBarColor({
    frontColor: c.dark ? '#ffffff' : '#000000',
    backgroundColor: c.bg,
    animation: { duration: 0 },
    fail() { /* tab bar page during switch, or not a page */ },
  })
  if (key === lastChrome) return
  lastChrome = key
  if (wx.setBackgroundColor) {
    wx.setBackgroundColor({
      backgroundColor: c.bg, backgroundColorTop: c.bg, backgroundColorBottom: c.bg,
      fail() { /* ignore */ },
    })
  }
  if (wx.setBackgroundTextStyle) wx.setBackgroundTextStyle({ textStyle: c.dark ? 'light' : 'dark', fail() { /* ignore */ } })
}

/** Forget cached chrome state (the OS theme flipped). */
export function resetChrome() { lastChrome = '' }
