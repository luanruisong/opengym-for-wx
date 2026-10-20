import { describe, it, expect } from 'vitest'
import { setNumberAt, blockModel, columnsOf } from '../../../miniprogram/pkg-workout/workout/block-model.js'
import { freshState } from '../../../miniprogram/store/store.js'

const S0 = () => {
  const S = freshState()
  S.unit = 'kg'
  S.active = {
    id: 'a1', d: '2026-10-20', start: Date.now(), routineIds: [], name: 'Test', cur: 0,
    entries: [{
      id: '0025', target: { sets: 3, reps: 8, weight: 60 },
      sets: [
        { w: 40, r: 8, done: true, phase: 'warmup' },
        { w: 60, r: 8, done: true },
        { w: 60, r: 8, done: false },
      ],
    }],
  }
  return S
}

describe('setNumberAt', () => {
  it('numbers warm-ups and work sets each from 1', () => {
    const sets = [{ phase: 'warmup' }, { phase: 'warmup' }, {}, {}]
    expect([0, 1, 2, 3].map(i => setNumberAt(sets, i))).toEqual([1, 2, 1, 2])
  })
  it('a timed L/R pair is one set', () => {
    const sets = [{ side: 'L' }, { side: 'R' }, { side: 'L' }, { side: 'R' }]
    expect([0, 1, 2, 3].map(i => setNumberAt(sets, i))).toEqual([1, 1, 2, 2])
  })
})

describe('blockModel', () => {
  it('builds rows with the warm-up header and numbers', () => {
    const { vm, ctx } = blockModel(S0(), 0, {})
    expect(vm.groups.length).toBe(3)
    expect(vm.groups[0].warmHdr).toBe(true)
    expect(vm.groups[1].sep).toBe(true)
    expect(vm.groups[1].rows[0].num).toBe(1)
    expect(vm.groups[2].rows[0].done).toBe(false)
    expect(vm.groups[2].rows[0].c1.v).toBe(60)
    expect(ctx.mode).toBe('reps')
  })
  it('nothing for a missing entry', () => {
    expect(blockModel(S0(), 5, {}).vm).toBe(null)
  })
  it('dense drops tags and notes', () => {
    const S = S0()
    S.exNotes = { '0025': 'seat 4' }
    expect(blockModel(S, 0, {}).vm.standingNote).toBe('seat 4')
    const d = blockModel(S, 0, { dense: true }).vm
    expect(d.standingNote).toBe('')
    expect(d.tags.length).toBe(0)
  })
  it('effort column when the profile logs RIR', () => {
    const S = S0()
    S.effort = 'rir'
    S.active.entries[0].sets[2].rir = 2
    const { vm } = blockModel(S, 0, {})
    expect(vm.hasC3).toBe(true)
    const c3 = vm.groups[2].rows[0].c3
    expect(c3.eff).toBe(true)
    expect(c3.v).toBe('2')
    expect(c3.style).toContain('var(--yellow)')
  })
  it('weight column steps on the exercise grid', () => {
    const S = S0()
    const c = columnsOf(S, S.active.entries[0])
    expect(c.col1.f).toBe('w')
    expect(c.stepLoad(60, c.col1.step, 1)).toBeGreaterThan(60)
  })
})
