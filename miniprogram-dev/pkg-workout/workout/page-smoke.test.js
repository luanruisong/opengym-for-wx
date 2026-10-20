import { it, expect } from 'vitest'
import { useStore, freshState } from '../../../miniprogram/store/store.js'
import { useUI } from '../../../miniprogram/store/ui.js'

const defs = {}
globalThis.Page = o => { defs.page = o }
globalThis.Component = o => { defs.comps = defs.comps || []; defs.comps.push(o) }
globalThis.getApp = () => ({ ready: Promise.resolve(), globalData: {} })
globalThis.getCurrentPages = () => []

it('page and components map a session without throwing', async () => {
  const S = freshState()
  S.effort = 'rpe'
  S.workoutView = 'list'
  S.active = {
    id: 'a', d: '2026-10-20', start: Date.now() - 65000, routineIds: [], name: 'X', cur: 0,
    entries: [
      { id: '0025', target: { sets: 2, reps: 8, weight: 60 }, sets: [{ w: 60, r: 8, done: true, drops: [{ w: 40, r: 6 }] }, { w: 60, r: 8, done: false }] },
      { id: '0025', sg: 'g1', target: { sets: 1, reps: 8 }, sets: [{ w: 50, r: 8, done: false, rpe: 8 }] },
      { id: '0025', sg: 'g1', target: { sets: 1, reps: 8 }, sets: [{ w: 50, r: 8, done: false }] },
    ],
  }
  useStore.setState({ S })
  await import('../../../miniprogram/pkg-workout/workout/index.js')
  await import('../../../miniprogram/pkg-workout/components/ex-block/index.js')
  await import('../../../miniprogram/pkg-workout/components/focus-view/index.js')
  const ui = useUI.getState()
  const page = defs.page
  const ctx = Object.assign(Object.create(page), { setData() {}, data: {} })
  for (const v of ['list', 'compact', 'cards', 'focus']) {
    useStore.getState().update(s => { s.active.workoutView = v })
    const out = page.mapState.call(ctx, useStore.getState().S, { ui })
    expect(out.active).toBe(true)
    expect(JSON.stringify(out).length).toBeLessThan(100000)
  }
  for (const v of ["cards", "focus"]) {
    useStore.getState().update(s => { s.active.workoutView = v; s.active.cur = 1 })
    for (const c of defs.comps) {
      const got = []
      const self = Object.assign(Object.create(c.methods), { properties: { idx: 1, compact: true, dense: false, pairable: false, unit: [1, 2], epoch: 0, pairprev: false, pairnext: false }, data: {}, setData(d) { got.push(d); Object.assign(this.data, d) } })
      c.lifetimes.attached.call(self)
      await new Promise(r => setTimeout(r, 5))
      const d = got.reduce((a, b) => Object.assign(a, b), {})
      expect(d.vm || d.fv).toBeTruthy()
      if (d.fv) { self._select(0); expect(self.data.fv.prevDis).toBe(true) }
      if (d.vm) { expect(d.vm.hasC3).toBe(true); expect(d.vm.groups[0].rows[0].c3.v).toBe("8") }
      self.__unbind()
    }
  }
  const { blockModel } = await import('../../../miniprogram/pkg-workout/workout/block-model.js')
  for (let i = 0; i < 3; i++) expect(blockModel(useStore.getState().S, i, { ui }).vm.groups.length).toBeGreaterThan(0)
  useStore.getState().update(s => { s.active = null })
  const none = page.mapState.call(ctx, useStore.getState().S, { ui })
  expect(none.active).toBe(false)
  expect(none.chooser).toBeTruthy()
})

it('every sheet page module loads and its mapState runs', async () => {
  const S = freshState()
  S.active = { id: 'a', d: '2026-10-20', start: Date.now(), routineIds: [], name: 'X', cur: 0, entries: [{ id: '0025', target: { reps: 8 }, sets: [{ w: 60, r: 8, done: true }] }] }
  useStore.setState({ S })
  for (const name of ['note', 'rename', 'superset', 'complete', 'finish', 'effort', 'add-routine', 'settings', 'plates', 'summary']) {
    defs.page = null
    await import(new URL('../../../miniprogram/pkg-workout/' + name + '/index.js', import.meta.url).href)
    expect(defs.page, name).toBeTruthy()
    if (defs.page.mapState) {
      const ctx = Object.assign(Object.create(defs.page), { setData() {}, data: {}, query: {} })
      expect(() => defs.page.mapState.call(ctx, useStore.getState().S, { ui: useUI.getState(), state: useStore.getState() }), name).not.toThrow()
    }
  }
})
