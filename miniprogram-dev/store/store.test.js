import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useStore, DEF, freshState, KEY } from '../../miniprogram/store/store.js'
import { useUI, __resetUIForTest } from '../../miniprogram/store/ui.js'
import { beginWorkout, finishWorkout, loadStarterPlan, startFlow, exitWorkoutEdit, planText } from '../../miniprogram/store/actions.js'
import { pageParams } from '../../miniprogram/utils/nav.js'

const saved = () => {
  const head = wx.getStorageSync(KEY)
  if (!head) return null
  if (!String(head).startsWith('@chunks:')) return JSON.parse(head)
  const [gen, n] = String(head).slice(8).split(':')
  let s = ''
  for (let i = 0; i < Number(n); i++) s += wx.getStorageSync(KEY + '_' + gen + '_' + i)
  return JSON.parse(s)
}

// store.init() registers its onAppHide once, on the first init of the run.
const hide = []
wx.onAppHide = fn => hide.push(fn)
wx.onAppShow = () => {}
beforeEach(() => {
  wx.__store.clear()
  for (const k of Object.keys(wx.__calls)) delete wx.__calls[k]
  // confirmSheet → wx.showModal: confirm every dialog.
  wx.showModal = o => { (wx.__calls.showModal ||= []).push([o]); o.success && o.success({ confirm: true }) }
  wx.showActionSheet = o => { (wx.__calls.showActionSheet ||= []).push([o]) }
  __resetUIForTest()
  useStore.getState().replaceState(freshState())
  useStore.getState().flush()
  wx.__store.clear()
})
afterEach(() => { vi.useRealTimers() })

describe('init', () => {
  it('restores the saved copy over DEF', () => {
    wx.setStorageSync(KEY, JSON.stringify({ unit: 'lb', restSec: 120, workouts: [{ id: 'w1', d: '2026-10-01', start: 1, end: 2, entries: [] }] }))
    const S = useStore.getState().init()
    expect(useStore.getState().ready).toBe(true)
    expect(useStore.getState().user).toBe(null)
    expect(useStore.getState().isGuest()).toBe(true)
    expect(S.unit).toBe('lb')
    expect(S.restSec).toBe(120)
    expect(S.workouts).toHaveLength(1)
    // DEF fills what the saved copy lacks
    expect(S.reminder).toEqual(DEF.reminder)
    expect(S.lang).toBe('zh')
  })

  it('starts fresh with nothing (or garbage) saved', () => {
    wx.setStorageSync(KEY, '{not json')
    const S = useStore.getState().init()
    expect(S.workouts).toEqual([])
    expect(S.weighIn).toBe(false)
  })
})

describe('persistence', () => {
  it('debounces the write after update and flushes on app hide', () => {
    vi.useFakeTimers()
    useStore.getState().init()
    useStore.getState().update(s => { s.restSec = 75 })
    expect(useStore.getState().S.restSec).toBe(75)
    expect(saved()).toBe(null)
    vi.advanceTimersByTime(1000)
    expect(saved().restSec).toBe(75)
    expect(saved()._ts).toBeGreaterThan(0)

    useStore.getState().update(s => { s.restSec = 60 })
    expect(saved().restSec).toBe(75)
    hide.forEach(f => f())
    expect(saved().restSec).toBe(60)
  })

  it('splits a copy too big for one key and reads it back', () => {
    useStore.getState().init()
    const note = 'x'.repeat(300 * 1024)
    useStore.getState().update(s => { s.exNotes = { big: note } })
    useStore.getState().flush()
    expect(String(wx.getStorageSync(KEY))).toMatch(/^@chunks:/)
    expect(saved().exNotes.big).toBe(note)
    const S = useStore.getState().init()
    expect(S.exNotes.big).toBe(note)
    // and back to one key, with the chunks gone
    useStore.getState().update(s => { s.exNotes = {} })
    useStore.getState().flush()
    expect(String(wx.getStorageSync(KEY))).not.toMatch(/^@chunks:/)
    expect([...wx.__store.keys()].filter(k => k.startsWith(KEY + '_'))).toEqual([])
  })

  it('says once when storage refuses the write, and keeps the change in memory', () => {
    useStore.getState().init()
    const orig = wx.setStorageSync
    wx.setStorageSync = () => { throw new Error('full') }
    try {
      useStore.getState().update(s => { s.restSec = 33 })
      useStore.getState().flush()
      expect(useUI.getState().toastMsg).toMatch(/存储空间已满/)
      useUI.setState({ toastMsg: '' })
      useStore.getState().update(s => { s.restSec = 34 })
      useStore.getState().flush()
      expect(useUI.getState().toastMsg).toBe('')
      expect(useStore.getState().S.restSec).toBe(34)
    } finally { wx.setStorageSync = orig }
  })
})

describe('importBackup / replaceState / resetEverything', () => {
  it('importBackup replaces the copy and keeps a running workout', () => {
    useStore.getState().init()
    useStore.getState().update(s => { s.active = { id: 'a1', d: '2026-10-20', start: 1, entries: [] }; s.restSec = 10 })
    useStore.getState().importBackup({ unit: 'kg', restSec: 200, workouts: [{ id: 'b1', d: '2026-09-01', start: 1, end: 2, entries: [] }] })
    const S = useStore.getState().S
    expect(S.restSec).toBe(200)
    expect(S.workouts.map(w => w.id)).toEqual(['b1'])
    expect(S.active.id).toBe('a1')
    expect(S.wc).toEqual(DEF.wc)
    useStore.getState().flush()
    expect(saved().restSec).toBe(200)
  })

  it('replaceState puts a copy in place as is', () => {
    useStore.getState().init()
    const next = { ...freshState(), restSec: 45 }
    useStore.getState().replaceState(next)
    expect(useStore.getState().S.restSec).toBe(45)
    expect(useStore.getState().S).not.toBe(next)
  })

  it('resetEverything starts a new profile stamped with the reset', async () => {
    useStore.getState().init()
    loadStarterPlan('ppl')
    expect(useStore.getState().S.routines.length).toBeGreaterThan(0)
    await useStore.getState().resetEverything()
    const S = useStore.getState().S
    expect(S.routines).toEqual([])
    expect(S.week).toEqual({})
    expect(S.resetAt).toBeGreaterThan(0)
    expect(Array.isArray(S.resetIds) || typeof S.resetIds === 'object').toBe(true)
  })

  it('setUnit converts weights', () => {
    useStore.getState().init()
    useStore.getState().update(s => { s.bodyweight = [{ d: '2026-10-01', w: 100, t: 1 }] })
    useStore.getState().setUnit('lb')
    const S = useStore.getState().S
    expect(S.unit).toBe('lb')
    expect(S.bodyweight[0].w).toBeGreaterThan(200)
    expect(S.unitSet.convert).toBe(true)
  })
})

describe('workout flow', () => {
  it('beginWorkout → finishWorkout files the workout in S.workouts', () => {
    useStore.getState().init()
    expect(loadStarterPlan('ppl')).toBe(true)
    const r = useStore.getState().S.routines[0]
    beginWorkout([r.id], 80)
    let A = useStore.getState().S.active
    expect(A).toBeTruthy()
    expect(A.routineIds).toEqual([r.id])
    expect(A.bw).toBe(80)
    expect(A.entries.length).toBe(r.ex.length)
    expect(wx.__calls.navigateTo.at(-1)[0].url).toBe('/pkg-workout/workout/index')

    useStore.getState().update(s => {
      s.active.entries.forEach(e => e.sets.forEach(x => { x.done = true; x.at = Date.now(); x.r = 5; x.w = 20 }))
    })
    finishWorkout()
    const S = useStore.getState().S
    expect(S.active).toBe(null)
    expect(S.workouts).toHaveLength(1)
    expect(S.workouts[0].name).toBe(A.name)
    expect(S.workouts[0].entries.length).toBe(r.ex.length)
    expect(S.workouts[0].vol).toBeGreaterThan(0)
    // the summary page opens with the filed workout
    const nav = wx.__calls.navigateTo.at(-1)[0]
    expect(nav.url).toMatch(/^\/pkg-workout\/summary\/index\?_k=/)
    useStore.getState().flush()
    expect(saved().workouts).toHaveLength(1)
  })

  it('finishWorkout with nothing ticked asks first', () => {
    useStore.getState().init()
    loadStarterPlan('ppl')
    beginWorkout([useStore.getState().S.routines[0].id], null)
    // The question goes to wx.showModal (whose mock confirms) or, with an English label too long
    // for its buttons, to the menu page — whose confirm row is tapped here.
    const opened = []
    const navigateTo = wx.navigateTo
    wx.navigateTo = o => { opened.push(o.url) }
    try { finishWorkout() } finally { wx.navigateTo = navigateTo }
    if (opened.length) {
      const k = opened[0].match(/_k=(\w+)/)[1]
      pageParams({ _k: k }).sections[0].items[0].onClick()
    } else {
      expect(wx.__calls.showModal).toHaveLength(1)
    }
    expect(useStore.getState().S.active).toBe(null)
    expect(useStore.getState().S.workouts).toHaveLength(1)
  })

  // Tests run in English, where 'Finish anyway' is too long for wx.showModal's 4-character
  // buttons: the question goes to the themed menu page instead, and its confirm row finishes.
  it('a confirm whose button label is too long for the native modal opens the menu page', () => {
    useStore.getState().init()
    loadStarterPlan('ppl')
    beginWorkout([useStore.getState().S.routines[0].id], null)
    const opened = []
    const navigateTo = wx.navigateTo
    wx.navigateTo = o => { opened.push(o.url) }
    try { finishWorkout() } finally { wx.navigateTo = navigateTo }
    expect(opened).toHaveLength(1)
    expect(opened[0]).toMatch(/^\/pkg-common\/menu\/index\?_k=/)
    expect(useStore.getState().S.active).not.toBe(null)   // nothing finished until a row is tapped
  })

  it('startFlow skips the weigh-in when it is off', () => {
    useStore.getState().init()
    expect(useStore.getState().S.weighIn).toBe(false)
    startFlow([])
    expect(useStore.getState().S.active.name).toBeTruthy()
    expect(useStore.getState().S.active.entries).toEqual([])
  })

  it('startFlow opens the weigh-in page when it is on', () => {
    useStore.getState().init()
    useStore.getState().update(s => { s.weighIn = true })
    startFlow([])
    expect(useStore.getState().S.active).toBe(null)
    expect(wx.__calls.navigateTo.at(-1)[0].url).toMatch(/^\/pkg-body\/weigh-in\/index/)
  })

  it('exitWorkoutEdit without an edit just exits', () => {
    useStore.getState().init()
    const onExit = vi.fn()
    exitWorkoutEdit(onExit)
    expect(onExit).toHaveBeenCalled()
  })

  it('planText renders the plan as text', () => {
    useStore.getState().init()
    loadStarterPlan('ppl')
    const txt = planText()
    expect(txt).not.toMatch(/</)
    expect(txt).toContain(useStore.getState().S.routines[0].name)
  })
})

describe('ui timers', () => {
  it('rest counts down from endsAt and ends ready', () => {
    vi.useFakeTimers()
    useStore.getState().init()
    useUI.getState().startRest(3, 0)
    expect(useUI.getState().timer.left).toBe(3)
    vi.advanceTimersByTime(3100)
    expect(useUI.getState().timer.ready).toBe(true)
    useUI.getState().stopRest()
    expect(useUI.getState().timer).toBe(null)
  })

  it('toast with an action runs it once', () => {
    const run = vi.fn()
    useUI.getState().toast('x', { action: 'Undo', onAction: run })
    useUI.getState().runToastAction()
    useUI.getState().runToastAction()
    expect(run).toHaveBeenCalledTimes(1)
    expect(useUI.getState().toastMsg).toBe('')
  })
})
