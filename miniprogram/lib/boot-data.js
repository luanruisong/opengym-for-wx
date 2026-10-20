// Launch-time data loading (app.js: this.ready = loadCoreData().then(...)).
//
// The exercise catalogue and its texts are too big for the main package, so they sit in data-only
// subpackages that are fetched with require.async ("分包异步化"). The paths are relative to this
// file. app.json must declare each of them as a normal (non-independent) subpackage:
//   { "root": "data-ex", "pages": ["placeholder/index"] }   exercises-data.js, names-zh.js, body-paths.js
//   { "root": "data-instr-zh", "pages": ["placeholder/index"] }   instr-zh.js
//   { "root": "data-instr-en", "pages": ["placeholder/index"] }   instr-en.js
//   { "root": "data-desc-en", "pages": ["placeholder/index"] }   desc-en.js
//
// The literal require.async('…') calls must stay literal: the mini program compiler only wires up
// paths it can see.
import { initExercises } from './exercises.js'
import { setLang, setExerciseNames, setDetailsSource } from './i18n.js'
import { setBodyPaths } from './body-data.js'

// A module's exports after the compiler turned it into CommonJS: `export default {…}` arrives as
// { default: {…} }, named exports as properties.
const def = m => (m && m.default !== undefined ? m.default : m)

// require.async exists only in the mini program (base library ≥ 2.11.2); under Node (vitest) the
// module still loads, and a test hands in its own loader with _setAsyncLoader.
let testLoader = null
export function _setAsyncLoader(fn) { testLoader = fn }
const hasAsync = () => !!testLoader || (typeof require === 'function' && typeof require.async === 'function')

const loadEx = () => (testLoader ? testLoader('../data-ex/exercises-data.js') : require.async('../data-ex/exercises-data.js'))
const loadNames = () => (testLoader ? testLoader('../data-ex/names-zh.js') : require.async('../data-ex/names-zh.js'))
const loadBody = () => (testLoader ? testLoader('../data-ex/body-paths.js') : require.async('../data-ex/body-paths.js'))
const loadInstrZh = () => (testLoader ? testLoader('../data-instr-zh/instr-zh.js') : require.async('../data-instr-zh/instr-zh.js'))
const loadInstrEn = () => (testLoader ? testLoader('../data-instr-en/instr-en.js') : require.async('../data-instr-en/instr-en.js'))
const loadDescEn = () => (testLoader ? testLoader('../data-desc-en/desc-en.js') : require.async('../data-desc-en/desc-en.js'))

// One retry: a subpackage download can fail on a flaky network.
const retry = fn => fn().catch(() => fn())
const settle = p => p.then(def, e => { console.error('subpackage load failed', e); return null })

let corePromise = null

// Loads the catalogue (initExercises), the Chinese exercise names and the zh locale; registers the
// lazy loader for the exercise steps / descriptions. Resolves once the catalogue is usable;
// rejects only when the catalogue itself could not be loaded (twice).
export function loadCoreData() {
  if (corePromise) return corePromise
  setDetailsSource(loadDetails)
  if (!hasAsync()) {
    corePromise = Promise.reject(new Error('require.async is not available (base library ≥ 2.11.2 needed)'))
    return corePromise
  }
  corePromise = Promise.all([
    retry(loadEx),
    settle(retry(loadNames)),
    settle(retry(loadBody)),
  ]).then(([ex, names, body]) => {
    initExercises({ EXDB: ex.EXDB, EXALIAS: ex.EXALIAS })
    if (names) setExerciseNames(names)
    setBodyPaths(body)   // null on a failed load: the body map then draws nothing
    return setLang('zh')
  })
  corePromise.catch(() => { corePromise = null })   // a later call tries again
  return corePromise
}

// The steps (Chinese, English fallback) and English descriptions, fetched the first time a screen
// asks (i18n-core instrFor / descFor). Any that failed come back null and are asked for again later.
function loadDetails() {
  if (!hasAsync()) return Promise.resolve({ zhInstr: null, enInstr: null, enDesc: null })
  return Promise.all([settle(retry(loadInstrZh)), settle(retry(loadInstrEn)), settle(retry(loadDescEn))])
    .then(([zhInstr, enInstr, enDesc]) => ({ zhInstr, enInstr, enDesc }))
}
