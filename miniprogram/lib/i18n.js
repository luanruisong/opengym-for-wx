// Mini program shell of the i18n module. The runtime-agnostic state and readers live in
// i18n-core.js; this file adds setLang and the change subscription.
//
// MINI PROGRAM: Simplified Chinese only. The locale dictionary is bundled (locales/zh.js, main
// package). The Chinese exercise names live in the data-ex subpackage and are handed over by
// lib/boot-data.js (setExerciseNames) once it is loaded. Exercise steps and descriptions are
// loaded on first need through the details loader that boot-data.js registers
// (setDetailsSource), which require.async-s the data-instr-zh / data-instr-en / data-desc-en
// subpackages.
//
// `useLang` (React) is gone: use onLangChange(fn) → unsubscribe.

import {
  LANGS, INSTR_LANGS, EXERCISE_NAME_LANGS, DATE_LOCALES, DERIVED_LOCALES, RTL_LANGS,
  getLang, dateLocale, t, tn, instrFor, exerciseNameFor, exerciseNameSearchText, getVersion,
  baseLang, _setLangState, exerciseNameClass, descFor, instrTranslated, _setDetailsLoader, _setDetails, _detailsFailed
} from './i18n-core.js'
import ZH from '../locales/zh.js'

export {
  LANGS, INSTR_LANGS, EXERCISE_NAME_LANGS, DATE_LOCALES, DERIVED_LOCALES, RTL_LANGS,
  getLang, dateLocale, t, tn, instrFor, instrTranslated, descFor, exerciseNameFor, exerciseNameSearchText, exerciseNameClass, baseLang,
  getVersion
}

const subs = new Set()
const notify = () => { subs.forEach(f => { try { f(getVersion()) } catch (e) { console.error(e) } }) }

// Called with the new version whenever the language, the names or the loaded details change.
export function onLangChange(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}

let names = null        // { exId: 中文名 } once boot-data handed it over
let zhInstr = null      // { exId: [steps] } in Chinese, once loaded
let lastShowEn = true
let lastEnOnly = false
let current = 'en'

const apply = () => {
  _setLangState(current, current === 'zh' ? ZH : {}, current === 'zh' ? zhInstr : null,
    current === 'zh' ? names : null, lastShowEn, lastEnOnly)
  notify()
}

// The only language this build has is Chinese: whatever `l` says (the state's default 'en', an
// old backup's 'de') the UI is 'zh'. showEn / enOnly are the Settings switches for exercise names
// (English original in parentheses / English names only). Until setLang runs, i18n-core is in
// English (source strings), which is what the tests run in.
export function setLang(l, showEn, enOnly) {
  const lang = 'zh'
  const show = showEn !== false
  const only = enOnly === true
  if (lang === getLang() && getVersion() > 0 && show === lastShowEn && only === lastEnOnly) return Promise.resolve()
  current = lang
  lastShowEn = show
  lastEnOnly = only
  apply()
  return Promise.resolve()
}

// boot-data.js: the Chinese exercise-name pack (data-ex/names-zh.js).
export function setExerciseNames(pack) {
  names = pack || null
  apply()
}

// boot-data.js registers how to fetch the detail packs: an async function that resolves
// { zhInstr, enInstr, enDesc } (any of them null when its subpackage failed to load).
let detailsSource = null
export function setDetailsSource(fn) {
  detailsSource = fn
  _setDetailsLoader(loadDetails)
}

async function loadDetails() {
  let got = {}
  try { got = (detailsSource && (await detailsSource())) || {} } catch (e) { got = {} }
  const { zhInstr: zi = null, enInstr = null, enDesc = null } = got
  if (zi) { zhInstr = zi; apply() }
  _setDetails(enInstr, enDesc, null, getLang())
  if (!enInstr || !enDesc) _detailsFailed()
  notify()
}
