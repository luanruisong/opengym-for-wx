import { describe, it, expect, beforeEach } from 'vitest'
import { useStore, freshState } from '../../store/store.js'
import { useUI, __resetUIForTest } from '../../store/ui.js'
import { reorderRoutineUnit, moveEntry, toggleLink, removeRoutineExercise, undoRemoveRoutineExercise } from './ops.js'

const clone = v => JSON.parse(JSON.stringify(v))
const configured = (id, extra = {}) => ({ id, mode: 'reps', sets: 3, reps: 5, weight: 0, ...extra })
const entry = (id, setup, sg) => ({ id, sets: 3, reps: 5, weight: setup, note: `setup-${setup}`, ...(sg ? { sg } : {}) })
const ids = list => list.map(e => e.id)

function setRoutine(entries) {
  const S = freshState()
  S.routines = [{ id: 'r1', name: 'R', emoji: 'dumbbell', prog: 'linear', ex: clone(entries) }]
  useStore.getState().replaceState(S)
}
const ex = () => useStore.getState().S.routines[0].ex

beforeEach(() => {
  wx.__store.clear()
  __resetUIForTest()
})

describe('reorderRoutineUnit', () => {
  it('moves a single exercise to a slot counted over the other units', () => {
    const items = [configured('a'), configured('b'), configured('c'), configured('d')]
    expect(reorderRoutineUnit(items, 0, 2)).toBe(true)
    expect(ids(items)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves upward too (reverse slots)', () => {
    const items = [configured('a'), configured('b'), configured('c'), configured('d')]
    expect(reorderRoutineUnit(items, 3, 1)).toBe(true)
    expect(ids(items)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('returns false and leaves the list alone for the unit’s own slot', () => {
    const items = [configured('a'), configured('b'), configured('c')]
    const before = clone(items)
    expect(reorderRoutineUnit(items, 1, 1)).toBe(false)
    expect(items).toEqual(before)
    expect(reorderRoutineUnit([], 0, 1)).toBe(false)
    expect(reorderRoutineUnit(items, 9, 0)).toBe(false)
  })

  it('moves a whole grouped unit with every payload intact', () => {
    const pairA = configured('dup', { sg: 'pair', weight: 11, note: 'first', future: { a: 1 } })
    const pairB = configured('dup', { sg: 'pair', weight: 22, note: 'second', future: { b: 2 } })
    const items = [clone(pairA), clone(pairB), configured('c'), configured('d')]
    expect(reorderRoutineUnit(items, 1, 2)).toBe(true)
    expect(items).toEqual([configured('c'), configured('d'), pairA, pairB])
  })

  it('never splits another group', () => {
    const items = [configured('a'), configured('b', { sg: 'g' }), configured('c', { sg: 'g' }), configured('tail')]
    expect(reorderRoutineUnit(items, 3, 1)).toBe(true)
    expect(ids(items)).toEqual(['a', 'tail', 'b', 'c'])
  })

  it('moves the selected duplicate occurrence by position, not by catalogue id', () => {
    const first = configured('dup', { weight: 10, note: 'first' })
    const second = configured('dup', { weight: 20, note: 'second' })
    const items = [clone(first), configured('middle'), clone(second), configured('tail')]
    expect(reorderRoutineUnit(items, 2, 0)).toBe(true)
    expect(items).toEqual([second, first, configured('middle'), configured('tail')])
  })

  it('splices complete units at canonical slots and cleans true orphans', () => {
    const items = [configured('a', { sg: 'pair' }), configured('b', { sg: 'pair' }), configured('c', { sg: 'orphan' }), configured('d')]
    expect(reorderRoutineUnit(items, 3, 1)).toBe(true)
    expect(ids(items)).toEqual(['a', 'b', 'd', 'c'])
    expect(items[0].sg).toBe('pair'); expect(items[1].sg).toBe('pair'); expect(items[3].sg).toBeUndefined()
  })
})

describe('moveEntry (the arrows)', () => {
  it('moves a superset member inside its superset', () => {
    const items = [entry('c1', 10, 'g'), entry('c2', 20, 'g'), entry('c3', 30, 'g'), entry('c4', 40)]
    expect(moveEntry(items, 0, 1)).toBe(true)
    expect(items).toEqual([entry('c2', 20, 'g'), entry('c1', 10, 'g'), entry('c3', 30, 'g'), entry('c4', 40)])
  })

  it('takes the last member out of its superset where it stands, then moves it on', () => {
    const items = [entry('c1', 10, 'g'), entry('c2', 20, 'g'), entry('c3', 30, 'g'), entry('c4', 40)]
    expect(moveEntry(items, 2, 1)).toBe(true)
    expect(items).toEqual([entry('c1', 10, 'g'), entry('c2', 20, 'g'), entry('c3', 30), entry('c4', 40)])
    expect(moveEntry(items, 2, 1)).toBe(true)
    expect(items).toEqual([entry('c1', 10, 'g'), entry('c2', 20, 'g'), entry('c4', 40), entry('c3', 30)])
  })

  it('a first-row superset member leaves upward; a superset of two dissolves', () => {
    const items = [entry('c1', 10, 'g'), entry('c2', 20, 'g'), entry('c3', 30)]
    expect(moveEntry(items, 0, -1)).toBe(true)
    expect(items).toEqual([entry('c1', 10), entry('c2', 20), entry('c3', 30)])
    expect(moveEntry(items, 0, -1)).toBe(false)
  })

  it('a single exercise jumps a whole superset and does not join it', () => {
    const items = [entry('c3', 30), entry('c1', 10, 'g'), entry('c2', 20, 'g')]
    expect(moveEntry(items, 0, 1)).toBe(true)
    expect(items).toEqual([entry('c1', 10, 'g'), entry('c2', 20, 'g'), entry('c3', 30)])
  })

  it('moves the selected duplicate occurrence', () => {
    const items = [entry('c1', 10), entry('c2', 20), entry('c1', 30)]
    expect(moveEntry(items, 2, -1)).toBe(true)
    expect(items).toEqual([entry('c1', 10), entry('c1', 30), entry('c2', 20)])
  })

  it('does nothing at the boundaries, orphan link untouched', () => {
    const items = [entry('c1', 10, 'orphan'), entry('c2', 20)]
    expect(moveEntry(items, 0, -1)).toBe(false)
    expect(moveEntry(items, 1, 1)).toBe(false)
    expect(items[0].sg).toBe('orphan')
  })
})

describe('toggleLink', () => {
  it('links to the one above and unlinks again', () => {
    const items = [configured('a'), configured('b'), configured('c')]
    toggleLink(items, 1)
    expect(items[0].sg).toBeTruthy()
    expect(items[1].sg).toBe(items[0].sg)
    toggleLink(items, 2)
    expect(items[2].sg).toBe(items[0].sg)
    toggleLink(items, 2)
    expect(items[2].sg).toBeUndefined()
    toggleLink(items, 1)
    expect(items[0].sg).toBeUndefined()
    expect(items[1].sg).toBeUndefined()
  })
})

describe('removeRoutineExercise + Undo', () => {
  it('removes, toasts with Undo, and Undo brings back the superset link too', () => {
    const entries = [configured('1001', { sg: 'g1' }), configured('1002', { sg: 'g1' }), configured('1003')]
    setRoutine(entries)
    expect(removeRoutineExercise('r1', 1)).toBe(true)
    expect(ids(ex())).toEqual(['1001', '1003'])
    expect(ex()[0].sg).toBeUndefined()
    expect(useUI.getState().toastMsg).toMatch(/(left the routine\.|已离开计划。)$/)
    useUI.getState().runToastAction()
    expect(ex()).toEqual(entries)
  })

  it('Undo after another edit puts the exercise back at its old place', () => {
    setRoutine([configured('1001'), configured('1002'), configured('1003')])
    removeRoutineExercise('r1', 1)
    const pending = useUI.getState().toastAction
    useStore.getState().update(s => { s.routines[0].ex.push(configured('1004')) })
    pending.run()
    expect(ids(ex())).toEqual(['1001', '1002', '1003', '1004'])
  })

  it('a missing slot does nothing; Undo of a deleted routine says so', () => {
    setRoutine([configured('1001')])
    expect(removeRoutineExercise('r1', 5)).toBe(false)
    expect(undoRemoveRoutineExercise({ routineId: 'gone', i: 0, before: [], after: '[]', base: 0, del: 0 })).toBe(false)
    expect(useUI.getState().toastMsg).toBeTruthy()
  })
})
