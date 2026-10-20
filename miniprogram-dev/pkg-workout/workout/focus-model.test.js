import { describe, it, expect } from 'vitest'
import { firstIncomplete, clampSet, supersetSequence, toggleWarmup, addBurstTo, addDropTo, prescriptionBadges, planBadge } from '../../../miniprogram/pkg-workout/workout/focus-model.js'
import { isWarmupRow, clustersOf, dropsOf } from '../../../miniprogram/lib/workout-model.js'

const entry = sets => ({ id: '0025', target: { reps: 8, sets: sets.length }, sets })

describe('focus-model', () => {
  it('opens at the first open set, or the last one when all are done', () => {
    expect(firstIncomplete(entry([{ done: true }, { done: false }, { done: false }]))).toBe(1)
    expect(firstIncomplete(entry([{ done: true }, { done: true }]))).toBe(1)
  })
  it('clamps a pointer into the rows', () => {
    const e = entry([{}, {}, {}])
    expect(clampSet(e, -2)).toBe(0)
    expect(clampSet(e, 9)).toBe(2)
  })
  it('walks a superset round by round, skipping members that ran out', () => {
    const entries = [entry([{}, {}]), entry([{}, {}, {}])]
    expect(supersetSequence(entries, [0, 1])).toEqual([
      { entryIdx: 0, setIdx: 0 }, { entryIdx: 1, setIdx: 0 },
      { entryIdx: 0, setIdx: 1 }, { entryIdx: 1, setIdx: 1 },
      { entryIdx: 1, setIdx: 2 },
    ])
  })
  it('toggles warm-up and drops the failure mark', () => {
    const w = toggleWarmup({ w: 40, r: 8, failure: true })
    expect(isWarmupRow(w)).toBe(true)
    expect(w.failure).toBeUndefined()
    expect(isWarmupRow(toggleWarmup(w))).toBe(false)
  })
  it('a burst adds to the row total', () => {
    const row = addBurstTo({ w: 60, r: 8, done: false }, 15)
    expect(clustersOf(row).length).toBe(1)
    expect(row.r).toBeGreaterThan(8)
  })
  it('a drop goes under the row weight', () => {
    const row = addDropTo({ w: 60, r: 8, done: false }, {})
    expect(dropsOf(row).length).toBe(1)
    expect(dropsOf(row)[0].w).toBeLessThan(60)
  })
  it('badges: progress, reps, load, rest', () => {
    const e = { id: '0025', target: { reps: 10, repsMin: 8, weight: 60, restSec: 90 }, sets: [{}, {}, {}] }
    const p = prescriptionBadges(e, 1, 'kg', 120)
    expect(p.progress).toBe('2/3')
    expect(p.badges[0]).toContain('8–10')
    expect(p.badges[1]).toBe('@ 60 kg')
    expect(p.badges[2]).toContain('90s')
  })
  it('plan badge only when today differs from the plan', () => {
    const planned = { sets: 3, reps: 10 }
    expect(planBadge({ planned, target: { sets: 3, reps: 10 } }, 'reps')).toBe('')
    expect(planBadge({ planned, target: { sets: 4, reps: 10 } }, 'reps')).not.toBe('')
    expect(planBadge({ planned, target: { sets: 3, reps: 10 } }, 'cardio')).toBe('')
  })
})
