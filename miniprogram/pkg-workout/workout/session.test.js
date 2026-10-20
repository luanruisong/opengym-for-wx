import { describe, it, expect, beforeEach } from 'vitest'
import { useStore, freshState } from '../../store/store.js'
import { useUI, __resetUIForTest } from '../../store/ui.js'
import * as W from './session.js'

const start = () => {
  const S = freshState()
  S.restSec = 90
  S.sound = false
  S.active = {
    id: 'a1', d: '2026-10-20', start: Date.now(), routineIds: [], name: 'Test', cur: 0,
    entries: [
      { id: '0025', target: { sets: 2, reps: 8, weight: 60 }, sets: [{ w: 60, r: 8, done: false }, { w: 60, r: 8, done: false }] },
      { id: '0025', target: { sets: 1, reps: 8, weight: 60 }, sets: [{ w: 60, r: 8, done: false }] },
    ],
  }
  useStore.setState({ S })
  W.resetMarks()
}
const A = () => useStore.getState().S.active

describe('workout session actions', () => {
  beforeEach(() => { __resetUIForTest(); start() })

  it('ticking a set starts the rest for that set', () => {
    W.toggle(0, 0)
    expect(A().entries[0].sets[0].done).toBe(true)
    const tm = useUI.getState().timer
    expect(tm && tm.total).toBe(90)
    expect(tm.forIdx).toBe(0)
    expect(tm.forSet).toBe(0)
  })

  it('a re-check leaves a running rest alone, and owes one when none runs', () => {
    W.toggle(0, 0)
    const first = useUI.getState().timer
    W.toggle(0, 0)   // untick
    W.toggle(0, 0)   // tick again: the rest that runs stays
    expect(useUI.getState().timer.endsAt).toBe(first.endsAt)
    useUI.getState().stopRest()
    W.toggle(0, 0); W.toggle(0, 0)
    expect(useUI.getState().timer.total).toBe(90)
  })

  it('a field edit cascades the weight to the later sets', () => {
    W.setField(0, 0, 'w', 62.5)
    expect(A().entries[0].sets.map(s => s.w)).toEqual([62.5, 62.5])
  })

  it('delete keeps one set, undo puts it back', () => {
    expect(W.deleteActiveSet(1, 0)).toBe(false)
    expect(W.deleteActiveSet(0, 1)).toBe(true)
    expect(A().entries[0].sets.length).toBe(1)
    useUI.getState().runToastAction()
    expect(A().entries[0].sets.length).toBe(2)
  })

  it('copy adds a row under the copied one', () => {
    W.copyActiveSet(0, 0)
    expect(A().entries[0].sets.length).toBe(3)
  })

  it('pairing and unpairing two exercises', () => {
    W.pairAt(0, 1)
    expect(A().entries[0].sg).toBeTruthy()
    expect(A().entries[0].sg).toBe(A().entries[1].sg)
    W.unpairAt(0)
    expect(A().entries[0].sg).toBeFalsy()
  })

  it('navigating units moves the marker', () => {
    W.navigateUnit(1)
    expect(A().cur).toBe(1)
    W.navigateUnit(1)
    expect(A().cur).toBe(1)
    W.navigateUnit(-1)
    expect(A().cur).toBe(0)
  })

  it('removing an exercise re-points the rest of a later one', () => {
    W.toggle(1, 0)
    // last set of the workout: no rest after it
    W.toggle(0, 0)
    expect(useUI.getState().timer.forIdx).toBe(0)
    W.removeActiveExercise(0)
    expect(useUI.getState().timer).toBe(null)
    expect(A().entries.length).toBe(1)
  })
})
