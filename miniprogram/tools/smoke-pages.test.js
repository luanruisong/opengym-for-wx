// Loads every page and component listed in app.json under a fake Page/Component/wx, runs its
// lifecycle (onLoad → onShow → onReady) against three store states (empty, a plan with history,
// a workout in progress) and fails on:
//   · a throw, or a console.error, while loading or rendering (connectPage swallows mapState
//     errors into console.error, so those count);
//   · a WXML event binding (bindtap="x", catch:change="x"…) naming a method the page doesn't have.
// Run:  cd frontend && npx vitest run --config ../miniprogram/tools/vitest.smoke.config.mjs
import { describe, it, expect, beforeAll, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
const PAGES = [...app.pages, ...app.subPackages.flatMap(p => p.pages.map(x => p.root + '/' + x))]
  .filter(p => !p.startsWith('data-'))

// Every component reachable from app.json + page jsons (+ the custom tab bar).
function componentsOf(jsonFile, seen) {
  if (!fs.existsSync(jsonFile)) return
  const j = JSON.parse(fs.readFileSync(jsonFile, 'utf8'))
  for (const p of Object.values(j.usingComponents || {})) {
    const abs = p.startsWith('/') ? path.join(ROOT, p) : path.resolve(path.dirname(jsonFile), p)
    const rel = path.relative(ROOT, abs)
    if (seen.has(rel)) continue
    seen.add(rel)
    componentsOf(abs + '.json', seen)
  }
}
const COMPONENTS = new Set(['custom-tab-bar/index'])
componentsOf(path.join(ROOT, 'app.json'), COMPONENTS)
PAGES.forEach(p => componentsOf(path.join(ROOT, p + '.json'), COMPONENTS))
componentsOf(path.join(ROOT, 'custom-tab-bar/index.json'), COMPONENTS)

// A wx whose missing members are harmless no-op functions (success callbacks fire with {}).
function permissiveWx() {
  const base = globalThis.wx
  const noop = name => (...args) => {
    const o = args[0]
    if (o && typeof o.success === 'function') try { o.success({}) } catch (e) { /* page code */ }
    if (name.startsWith('create') || name.startsWith('get')) return chain()
    return undefined
  }
  const chain = () => new Proxy(function () {}, {
    get: (_, k) => (k === 'then' ? undefined : (...a) => { const cb = a.find(x => typeof x === 'function'); if (k === 'exec' && cb) cb([]); return chain() }),
    apply: () => chain(),
  })
  globalThis.wx = new Proxy(base, {
    get(t, k) {
      if (k in t) return t[k]
      if (typeof k !== 'string') return undefined
      if (k === 'getAppBaseInfo' || k === 'getSystemInfoSync' || k === 'getWindowInfo') return () => ({ theme: 'dark', platform: 'devtools', windowWidth: 375, windowHeight: 750, pixelRatio: 2, safeArea: { bottom: 750 } })
      if (k === 'getMenuButtonBoundingClientRect') return () => ({ top: 4, bottom: 36, left: 280, right: 360, height: 32, width: 80 })
      return noop(k)
    },
  })
}

let captured = null
globalThis.Page = opts => { captured = { kind: 'page', opts } }
globalThis.Component = opts => { captured = { kind: 'component', opts } }
globalThis.Behavior = opts => opts

const stack = []
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms))

function instance(def, query) {
  const opts = def.opts
  const isComp = def.kind === 'component'
  const inst = {
    data: JSON.parse(JSON.stringify(opts.data || {})),
    properties: {},
    setData(patch, cb) {
      for (const [k, v] of Object.entries(patch)) {
        // 'a.b[0].c' paths: good enough to set top-level and dotted keys.
        const keys = k.replace(/\[(\d+)\]/g, '.$1').split('.')
        let o = this.data
        for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]] = o[keys[i]] ?? {}
        o[keys[keys.length - 1]] = v
      }
      if (cb) cb()
    },
    getTabBar: () => ({ setData() {} }),
    selectComponent: () => null,
    selectAllComponents: () => [],
    createSelectorQuery: () => wx.createSelectorQuery(),
    triggerEvent() {},
    getOpenerEventChannel: () => ({ emit() {}, on() {} }),
    route: '', options: query,
  }
  if (isComp) {
    for (const [k, v] of Object.entries(opts.properties || {})) {
      const val = v && typeof v === 'object' && 'value' in v ? v.value : (v === Number ? 0 : v === String ? '' : v === Boolean ? false : v === Array ? [] : v === Object ? {} : null)
      inst.properties[k] = val
      inst.data[k] = val
    }
    Object.assign(inst, opts.methods || {})
  } else {
    for (const [k, v] of Object.entries(opts)) if (typeof v === 'function') inst[k] = v
  }
  return inst
}

// Handler names a WXML file binds: bindtap="x", bind:change="x", catchtap="x", mut-bind:tap="x".
function handlersIn(wxml) {
  const out = new Set()
  const re = /\s(?:capture-)?(?:bind|catch|mut-bind)(?::)?[a-zA-Z]+\s*=\s*"([^"]*)"/g
  let m
  while ((m = re.exec(wxml))) if (!m[1].includes('{{') && m[1].trim()) out.add(m[1].trim())
  return out
}

let useStore, actions
async function seed(kind) {
  const st = useStore.getState()
  st.resetEverything()
  if (kind === 'empty') return
  actions.loadStarterPlan('ppl')
  const routines = useStore.getState().S.routines
  // A handful of finished workouts for history/stats, then (for 'active') one in progress.
  for (let i = 0; i < 3; i++) {
    actions.beginWorkout([routines[i % routines.length].id], null)
    useStore.getState().update(s => {
      s.active.start = Date.now() - (i + 1) * 86400000 * 2
      s.active.d = new Date(s.active.start).toISOString().slice(0, 10)
      for (const e of s.active.entries || []) for (const set of e.sets || []) { set.done = true; if (set.w == null) set.w = 40; if (set.r == null) set.r = 8 }
    })
    actions.doFinishWorkout ? actions.doFinishWorkout() : actions.finishWorkout()
    await tick(5)
  }
  useStore.getState().update(s => { s.bodyweight = [{ d: '2026-10-01', w: 80 }, { d: '2026-10-10', w: 79.5 }] })
  if (kind === 'active') actions.beginWorkout([routines[0].id], null)
}

const failures = []
const DEFS = new Map()   // file → the Page/Component definition its module registered (modules load once)
beforeAll(async () => {
  permissiveWx()
  globalThis.getCurrentPages = () => stack
  const appObj = { globalData: {}, ready: Promise.resolve() }
  globalThis.getApp = () => appObj
  ;({ useStore } = await import('../store/store.js'))
  actions = await import('../store/actions.js')
  useStore.getState().init()
})

async function exercise(file, kind, query) {
  const errors = []
  const spy = vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.map(x => (x && x.stack) || String(x)).join(' ')))
  try {
    if (!DEFS.has(file)) {
      captured = null
      await import("../" + file + ".js")
      if (!captured) { errors.push("module did not call Page()/Component()"); return errors }
      DEFS.set(file, captured)
    }
    const def = DEFS.get(file)
    const inst = instance(def, query)
    stack.length = 0
    stack.push({ route: file }, inst)
    if (def.kind === 'page') {
      inst.onLoad && inst.onLoad.call(inst, query)
      await tick()
      inst.onShow && inst.onShow.call(inst)
      await tick()
      inst.onReady && inst.onReady.call(inst)
      await tick()
      if (!inst.data.theme) errors.push("page never rendered through connectPage (no theme in data)")
      inst.onHide && inst.onHide.call(inst)
      inst.onUnload && inst.onUnload.call(inst)
    } else {
      const lt = def.opts.lifetimes || {}
      ;(lt.created || def.opts.created || (() => {})).call(inst)
      ;(lt.attached || def.opts.attached || (() => {})).call(inst)
      await tick()
      ;(lt.ready || def.opts.ready || (() => {})).call(inst)
      ;(lt.detached || def.opts.detached || (() => {})).call(inst)
    }
    // Bound handlers must exist.
    const wxml = fs.readFileSync(path.join(ROOT, file + '.wxml'), 'utf8')
    const methods = def.kind === 'page' ? def.opts : (def.opts.methods || {})
    for (const h of handlersIn(wxml)) if (typeof methods[h] !== 'function') errors.push(`WXML binds "${h}" but no such method`)
  } catch (e) {
    errors.push('THROW ' + ((e && e.stack) || e))
  } finally {
    spy.mockRestore()
  }
  return errors
}

// Pages opened with a URL query of their own (the rest get their arguments through pageParams).
const QUERY = {
  'pkg-plan/routine/index': () => ({ id: useStore.getState().S.routines[0]?.id || 'x' }),
  'pkg-settings/page/index': () => ({ page: 'workout' }),
}

describe.each(['empty', 'history', 'active'])('state: %s', kind => {
  beforeAll(async () => { await seed(kind) })
  it.each(PAGES)('page %s', async p => {
    const errs = await exercise(p, kind, QUERY[p] ? QUERY[p]() : {})
    if (errs.length) failures.push({ kind, file: p, errs })
    expect(errs, errs.join('\n---\n')).toEqual([])
  })
  it.each([...COMPONENTS])('component %s', async c => {
    const errs = await exercise(c, kind, {})
    expect(errs, errs.join('\n---\n')).toEqual([])
  })
})

// The settings sub-pages each render differently; run them all once with history.
describe('settings sub-pages', () => {
  beforeAll(async () => { await seed('history') })
  it.each(['workout', 'alerts', 'plan', 'units', 'equipment', 'look', 'data', 'about', 'advanced'])('page=%s', async page => {
    const errs = await exercise('pkg-settings/page/index', 'history', { page })
    expect(errs, errs.join('\n---\n')).toEqual([])
  })
})
