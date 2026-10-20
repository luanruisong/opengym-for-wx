// The exercise settings sheet's draft → view and draft → saved config, as the web app's
// sheets.config-*.test.jsx, sheets.progression-row.test.jsx and sheets.backoff.test.jsx assert them.
import { describe, it, expect } from 'vitest'
import { EXIDX } from '../../lib/exercises.js'
import { exLine } from '../../lib/history.js'
import { DEF } from '../../store/store.js'
import {
  initDraft, viewOf, saveOut, ruleOptions, editRule, editField, editFailure, editPyramidOn, editPyramidAdd,
  editPyramidRemove, editPyramidMax, editPyramidPreset, editPerSide, editBodyweight, editMode, editIntensifier,
  applyLoadKind, applyBarWeight, applyNoBar,
} from './model.js'

const clone = v => JSON.parse(JSON.stringify(v))
const St = (over = {}) => ({ ...clone(DEF), unit: 'kg', ...over })
const machine = () => EXIDX['0009']   // a weighted machine exercise (assisted dip: less is harder)
const bench = () => EXIDX['0025']     // barbell bench press
const draft = (ex, cfg, S = St()) => initDraft(ex, { existing: cfg, S })
const view = (c, ex, S = St(), routine) => viewOf(c, ex, S, routine, { existing: true })
const save = (c, ex, S = St(), routine) => saveOut(c, ex, { S, routine })

describe('last set to failure', () => {
  const base = { sets: 3, reps: 5, weight: 40, mode: 'reps' }
  it('is off by default and saves nothing then', () => {
    const c = draft(machine(), base)
    expect(view(c, machine()).failure).toBe(false)
    expect('lastToFailure' in save(c, machine())).toBe(false)
  })
  it('switched on, it saves the flag and says what it does', () => {
    const c = editFailure(draft(machine(), base), true)
    expect(view(c, machine()).failureSub).toContain('counts as all-out effort unless you rate it')
    expect(save(c, machine()).lastToFailure).toBe(true)
  })
  it('comes on with Greyskull unless it was already decided', () => {
    const c = editRule(draft(machine(), base), 'greyskull', machine())
    expect(view(c, machine()).failure).toBe(true)
    expect(save(c, machine())).toMatchObject({ prog: 'greyskull', lastToFailure: true })
    const decided = editRule({ ...draft(machine(), base), lastToFailure: false }, 'greyskull', machine())
    expect(decided.lastToFailure).toBe(false)
  })
  it('is not offered on a pyramid, which has its own Max set', () => {
    const c = draft(machine(), { ...base, pyramid: [12, 8, 'max'] })
    expect(view(c, machine()).showFailure).toBe(false)
    expect('lastToFailure' in save({ ...c, lastToFailure: true }, machine())).toBe(false)
  })
})

describe('triple progression', () => {
  const base = { sets: 3, reps: 12, weight: 40, mode: 'reps' }
  it('picked as the rule, it shows the rep range and where the sets stop, room for two more sets', () => {
    const c = editRule(draft(machine(), base), 'triple', machine())
    const v = view(c, machine())
    expect(v.prog.showRange && v.prog.showSetsMax).toBe(true)
    expect(v.setsLabel).toBe('Sets from')
    expect(v.showReps).toBe(false)
    expect(v.prog.setsMax).toBe(5)
    expect(v.prog.desc).toContain('then a set is added')
    expect(save(c, machine())).toMatchObject({ prog: 'triple', sets: 3, setsMax: 5, reps: 12, repsMin: 10 })
  })
  it('reopens with its numbers, and a ceiling at the sets is not written', () => {
    const c = draft(machine(), { ...base, prog: 'triple', sets: 4, setsMax: 4, repsMin: 8 })
    const v = view(c, machine())
    expect(v.prog.setsMax).toBe(4)
    expect(v.prog.repsFrom).toBe(8)
    const out = save(c, machine())
    expect(out).toMatchObject({ prog: 'triple', sets: 4, repsMin: 8 })
    expect('setsMax' in out).toBe(false)
  })
  it('is not offered on bodyweight work with nothing added', () => {
    const c = draft(machine(), { ...base, bodyweight: true, weight: 0 })
    expect(ruleOptions(c, machine()).map(o => o.value)).not.toContain('triple')
    expect(ruleOptions(draft(machine(), base), machine()).map(o => o.value)).toContain('triple')
  })
  it('a plan with another rule saves no set ceiling', () => {
    const c = draft(machine(), { ...base, prog: 'double', repsMin: 8, setsMax: 5 })
    expect(view(c, machine()).prog.showSetsMax).toBe(false)
    expect('setsMax' in save(c, machine())).toBe(false)
  })
})

describe('progression row', () => {
  const base = { sets: 3, reps: 10, weight: 40, mode: 'reps' }
  const steppers = p => 1 + (p.showRange ? 2 : 0) + (p.showSetsMax ? 1 : 0) + (p.showDeload ? 1 : 0)
  it('marks the four-stepper double-progression row so it wraps into pairs', () => {
    const p = view(draft(machine(), { ...base, prog: 'double' }), machine()).prog
    expect(steppers(p)).toBe(4)
    expect(p.row4).toBe(true)
  })
  it('leaves the shorter rows alone', () => {
    const linear = view(draft(machine(), { ...base, prog: 'linear' }), machine()).prog
    expect(steppers(linear)).toBe(2)
    expect(linear.row4).toBe(false)
    const bw = view(draft(machine(), { ...base, prog: 'double', weight: 0, bodyweight: true }), machine()).prog
    expect(steppers(bw)).toBe(3)
    expect(bw.row4).toBe(false)
  })
  it('the Rule row reads "Follow the routine" until one is picked', () => {
    const c = draft(machine(), base)
    expect(view(c, machine(), St(), { prog: 'double' }).prog.ruleValue).toMatch(/Follow the routine/)
    expect(view(editRule(c, 'linear', machine()), machine()).prog.ruleValue).toBe('Linear progression')
  })
  it('an invalid step disables Save and saves nothing', () => {
    const c = editField(draft(machine(), { ...base, prog: 'linear' }), 'inc', 0)
    const v = view(c, machine())
    expect(v.prog.invalid).toBe(true)
    expect(v.saveDisabled).toBe(true)
    expect(save(c, machine())).toBeNull()
    expect(save(editRule(c, 'off', machine()), machine())).not.toBeNull()
  })
})

describe('back-off sets', () => {
  const base = { sets: 3, reps: 6, weight: 26, mode: 'reps', inc: 2 }
  it('is off by default and saves no field', () => {
    const c = draft(bench(), base)
    const p = view(c, bench()).prog
    expect(p.canBackoff).toBe(true)
    expect(p.backoffText).toBe('All sets at the same weight.')
    expect('backoff' in save(c, bench())).toBe(false)
  })
  it('switched on, previews the sets and saves the flag', () => {
    const c = { ...draft(bench(), base), backoff: true }
    expect(view(c, bench()).prog.backoffText).toContain('Sets open at 26 → 24 → 22 kg.')
    const saved = save(c, bench())
    expect(saved.backoff).toBe(true)
    expect(saved.inc).toBe(2)
    expect(exLine({ id: '0025', ...saved }, 'kg')).toBe('3 × 6 · 26 → 24 → 22 kg')
  })
  it('switched off again, drops the flag', () => {
    const c = { ...draft(bench(), { ...base, backoff: true }), backoff: undefined }
    expect('backoff' in save(c, bench())).toBe(false)
  })
  it('is not offered on an assistance machine, nor for pyramid sets', () => {
    expect(view(draft(machine(), { sets: 3, reps: 6, weight: 30, mode: 'reps' }), machine()).prog.canBackoff).toBe(false)
    const pyr = view(draft(bench(), { ...base, pyramid: [12, 10, 8] }), bench())
    expect(pyr.prog.show).toBe(false)
    expect(pyr.pyramidProgNote).toBe(true)
  })
})

describe('pyramid sets', () => {
  const base = { sets: 3, reps: 10, weight: 0, mode: 'reps', pyramid: [12, 10, 8] }
  it('shows one row per set and saves the weights typed', () => {
    let c = draft(machine(), base)
    expect(view(c, machine()).pyramidRows).toHaveLength(3)
    c = editField(c, 'pyrW', 40, { i: 0 })
    c = editField(c, 'pyrW', 60, { i: 2 })
    const out = save(c, machine())
    expect(out.pyramid).toEqual([12, 10, 8])
    expect(out.pyramidWeight).toEqual([40, 0, 60])
  })
  it('opens on saved weights; all at 0 writes no field', () => {
    const c = draft(machine(), { ...base, pyramidWeight: [40, 50, 60] })
    expect(view(c, machine()).pyramidRows.map(r => r.weight)).toEqual([40, 50, 60])
    expect(save(draft(machine(), base), machine())).not.toHaveProperty('pyramidWeight')
    expect(save(c, machine()).pyramidWeight).toEqual([40, 50, 60])
  })
  it('keeps bodyweight work on its one Added load', () => {
    const c = draft(machine(), { ...base, bodyweight: true, pyramidWeight: [40, 50, 60] })
    expect(view(c, machine()).bw).toBe(true)
    expect(save(c, machine())).not.toHaveProperty('pyramidWeight')
  })
  it('add copies the last set, remove drops one, Max toggles, presets replace, off keeps a draft', () => {
    let c = draft(machine(), { ...base, pyramidRest: [60, 90, 120] })
    c = editPyramidAdd(c)
    expect(c.pyramid).toEqual([12, 10, 8, 8])
    expect(c.pyramidRest).toEqual([60, 90, 120, 120])
    c = editPyramidRemove(c, 0)
    expect(c.pyramid).toEqual([10, 8, 8])
    expect(c.pyramidRest).toEqual([90, 120, 120])
    c = editPyramidMax(c, 2)
    expect(c.pyramid[2]).toBe('max')
    expect(view(c, machine()).pyramidRows[2].isMax).toBe(true)
    c = editPyramidPreset(c, 0)
    expect(c.pyramid).toEqual([12, 10, 8, 6])
    expect(c.pyramidRest).toBeUndefined()
    const off = editPyramidOn(c, false)
    expect(off.pyramid).toBeUndefined()
    expect(off).toMatchObject({ sets: 4, reps: 12, pyramidDraft: [12, 10, 8, 6] })
    expect(save(off, machine())).not.toHaveProperty('pyramid')
    expect(editPyramidOn(off, true).pyramid).toEqual([12, 10, 8, 6])
  })
})

describe('rest for this exercise', () => {
  it('reads Default with the default rest when the exercise has none', () => {
    const S = St({ restSec: 120 })
    const c = draft(machine(), { sets: 3, reps: 10, weight: 40, mode: 'reps', restSec: 0 }, S)
    expect(view(c, machine(), S).restValue).toBe('Default (2:00)')
    expect(save(c, machine(), S).restSec || 0).toBe(0)
  })
  it('shows its own rest as a time and saves it', () => {
    const c = draft(machine(), { sets: 3, reps: 10, weight: 40, mode: 'reps', restSec: 75 })
    expect(view(c, machine()).restValue).toBe('1:15')
    expect(save(c, machine()).restSec).toBe(75)
  })
})

describe('typing into fields with a minimum', () => {
  const base = { sets: 3, reps: 10, weight: 40, mode: 'reps' }
  it('a drop-set saves what was typed', () => {
    let c = draft(machine(), { ...base, intensifier: { type: 'dropset', count: 2, pct: 10 } })
    c = editField(c, 'dropPct', null)
    c = editField(c, 'dropPct', 20)
    c = editField(c, 'dropCount', 3)
    expect(save(c, machine()).intensifier).toEqual({ type: 'dropset', count: 3, pct: 20 })
  })
  it('a rest-pause saved from fields below their minimum is held to them', () => {
    let c = draft(machine(), { ...base, intensifier: { type: 'restpause', totalReps: 8, restSec: 15 } })
    c = editField(c, 'rpRest', 2)
    c = editField(c, 'rpReps', null)
    expect(save(c, machine()).intensifier).toEqual({ type: 'restpause', totalReps: 1, restSec: 5 })
    expect(view(c, machine()).showSets).toBe(false)
    expect(view(c, machine()).showWarmups).toBe(false)
  })
  it('the deload percentage opens at 90 and saves what was typed', () => {
    let c = draft(machine(), { ...base, prog: 'linear' })
    expect(view(c, machine()).prog.deload).toBe(90)
    c = editField(c, 'deload', 85)
    expect(save(c, machine()).deloadFactor).toBe(0.85)
    expect('deloadFactor' in save(editField(c, 'deload', 90), machine())).toBe(false)
  })
  it('picking an intensifier fills its numbers; None takes it off', () => {
    let c = editIntensifier(draft(machine(), base), 'restpause', St({ restPauseSec: 20 }))
    expect(c.intensifier).toEqual({ type: 'restpause', totalReps: 10, restSec: 20 })
    c = editIntensifier(c, 'dropset')
    expect(c.intensifier).toEqual({ type: 'dropset', count: 1, pct: 20 })
    expect('intensifier' in save(editIntensifier(c, ''), machine())).toBe(false)
  })
})

describe('a timed bodyweight hold', () => {
  it('has one weight field, the added load, and talks about the hold', () => {
    const v = view(draft(machine(), { mode: 'time', sec: 45, weight: 0, bodyweight: true }), machine())
    expect(v.showTimeWeight).toBe(false)
    expect(v.bw).toBe(true)
    expect(v.bwSub).toBe('No weight to enter. Just time the hold.')
  })
  it('keeps the one weight field on a loaded hold', () => {
    const v = view(draft(machine(), { mode: 'time', sec: 45, weight: 10, bodyweight: false }), machine())
    expect(v.showTimeWeight).toBe(true)
    expect(v.bw).toBe(false)
  })
})

describe('mode, per side and bodyweight', () => {
  it('switching to Time keeps the sets and fills the seconds', () => {
    const c = editMode(draft(machine(), { sets: 4, reps: 8, weight: 30, mode: 'reps' }), 'time', machine())
    const out = save(c, machine())
    expect(out).toMatchObject({ mode: 'time', sets: 4, weight: 30 })
    expect(out.sec).toBeGreaterThan(0)
  })
  it('per side rounds the reps up to even and saves side', () => {
    const c = editPerSide(draft(machine(), { sets: 3, reps: 15, weight: 30, mode: 'reps' }), true, machine())
    expect(c.reps).toBe(16)
    expect(save(c, machine())).toMatchObject({ reps: 16, side: true })
  })
  it('bodyweight on clears the weight and is written when it differs from the dataset', () => {
    const c = editBodyweight(draft(machine(), { sets: 3, reps: 10, weight: 30, mode: 'reps' }), true)
    const out = save(c, machine())
    expect(out.weight).toBe(0)
    expect(out.bodyweight).toBe(true)
  })
  it('the warm-up count is held to 0..5 and only written when set', () => {
    let c = editField(draft(machine(), { sets: 3, reps: 10, weight: 30, mode: 'reps' }), 'warmupSets', 9)
    expect(save(c, machine()).warmupSets).toBe(5)
    c = editField(c, 'warmupSets', 0)
    expect('warmupSets' in save(c, machine())).toBe(false)
  })
  it('a new exercise opens on its default config and the note is trimmed', () => {
    const c = initDraft(bench(), { S: St() })
    const out = save({ ...c, note: '  bar only  ' }, bench())
    expect(out.mode).toBe('reps')
    expect(out.note).toBe('bar only')
  })
})

describe('plate loading writes', () => {
  it('a picked kind is stored; picking the default puts the exercise back on it', () => {
    const s = St()
    applyLoadKind(s, bench(), { id: '0025' }, 'single')
    expect(viewOf({ sets: 3, reps: 5, mode: 'reps' }, bench(), s).kind).toBe('single')
    applyLoadKind(s, bench(), { id: '0025' }, 'pairs')
    expect(viewOf({ sets: 3, reps: 5, mode: 'reps' }, bench(), s).kind).toBe('pairs')
  })
  it('No bar stores 0, the bar stepper at 0 clears the override', () => {
    const s = St()
    applyNoBar(s, bench(), true)
    expect(s.barWeights['0025']).toBe(0)
    expect(viewOf({ sets: 3, reps: 5, mode: 'reps' }, bench(), s).noBar).toBe(true)
    applyBarWeight(s, bench(), 15)
    expect(s.barWeights['0025']).toBe(15)
    expect(viewOf({ sets: 3, reps: 5, mode: 'reps' }, bench(), s).base).toBe(15)
    applyBarWeight(s, bench(), 0)
    expect('0025' in s.barWeights).toBe(false)
  })
})
