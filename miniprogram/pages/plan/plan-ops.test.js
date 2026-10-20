// Plan's removals with Undo (pages/plan/plan-ops.js), driven through the real store the way the
// page drives them. Assertions follow frontend/src/views/Plan.swipe.test.jsx,
// Plan.undo-sync.test.jsx and Plan.rotation.test.jsx.
import { beforeEach, describe, expect, it } from 'vitest'
import { DEF, useStore } from '../../store/store.js'
import { useUI, __resetUIForTest } from '../../store/ui.js'
import { t } from '../../lib/i18n.js'
import { deleteRoutine } from '../../lib/routines.js'
import { chooseFixedWeek, scheduleModeOf } from '../../lib/rotation.js'
import { mergeStates, stampChange } from '../../lib/sync-merge.js'
import { deleteRoutineWithUndo, undoDeleteRoutine, takeOutOfLoop, undoTakeOut, loopMark, setLoop } from './plan-ops.js'

const clone = v => JSON.parse(JSON.stringify(v))
const routine = (id, name, extra) => Object.assign({ id, name, emoji: null, ex: [{ id: '0025' }] }, extra)
const S = () => useStore.getState().S
const undo = () => useUI.getState().runToastAction()
const ids = list => list.map(r => r.id)

const load = extra => {
  const s = clone(DEF)
  Object.assign(s, {
    routines: [routine('a', 'Push A'), routine('b', 'Pull A'), routine('c', 'Legs')],
    week: { 1: ['a', 'b'], 3: ['b'], 5: ['c'] }, dayPlan: { '2099-01-01': 'b' },
  }, extra)
  useStore.getState().replaceState(s)
}

beforeEach(() => {
  wx.__store && wx.__store.clear()
  __resetUIForTest()
})

describe('deleteRoutineWithUndo', () => {
  it('deletes without a confirm, and Undo puts everything back in place', () => {
    load()
    const before = clone(S())
    expect(deleteRoutineWithUndo('b')).toBe(true)
    expect(ids(S().routines)).toEqual(['a', 'c'])
    expect(S().week).toEqual({ 1: ['a'], 5: ['c'] })
    expect(S().dayPlan).toEqual({})
    expect(useUI.getState().toastMsg).toBe(t('“{0}” gone.', 'Pull A'))
    expect(useUI.getState().toastAction.label).toBe(t('Undo'))
    undo()
    expect(S().routines).toEqual(before.routines)
    expect(S().week).toEqual(before.week)
    expect(S().dayPlan).toEqual(before.dayPlan)
  })

  it('an unknown id does nothing', () => {
    load()
    expect(deleteRoutineWithUndo('zz')).toBe(false)
    expect(ids(S().routines)).toEqual(['a', 'b', 'c'])
    expect(useUI.getState().toastMsg).toBe('')
  })

  it('an Undo that finds the routine already back says so', () => {
    load()
    deleteRoutineWithUndo('b')
    const pending = useUI.getState().toastAction
    useStore.getState().update(s => { s.routines.splice(1, 0, routine('b', 'Pull A')) })
    pending.run()
    expect(ids(S().routines)).toEqual(['a', 'b', 'c'])
    expect(useUI.getState().toastMsg).toBe(t('It’s already back.'))
  })

  it('undoDeleteRoutine reports false for a snapshot that cannot go back', () => {
    load()
    deleteRoutineWithUndo('b')
    const snap = { routine: routine('a', 'Push A'), at: 0 }   // 'a' still there
    expect(undoDeleteRoutine(snap)).toBe(false)
  })

  it('the routine put back is marked as added back, so the old removal does not win a merge', () => {
    load({ _ts: 1000, routines: [routine('a', 'Push', { _ts: 900 }), routine('b', 'Pull', { _ts: 900 }), routine('c', 'Legs', { _ts: 900 })] })
    deleteRoutineWithUndo('b')
    const deleted = clone(S())
    expect(deleted.deleted.routines.b).toBeGreaterThan(0)
    const other = clone(deleted); other.restSec = 75; other._ts = stampChange(deleted, other, Date.now() + 60000)
    undo()
    const here = S()
    expect(here.routines.find(r => r.id === 'b')._ts).toBe(900)
    expect(here.deleted.routines.b).toBeLessThan(0)
    for (const m of [mergeStates(here, other), mergeStates(other, here)]) {
      expect(ids(m.routines)).toEqual(['a', 'b', 'c'])
      expect(m.week[3]).toEqual(['b'])
      expect(m.restSec).toBe(75)
      expect(ids(mergeStates(m, deleted).routines)).toEqual(['a', 'b', 'c'])
    }
  })
})

describe('takeOutOfLoop', () => {
  const loop = () => ({
    rotation: { id: 'rot', sequence: ['a', 'b', 'c'], label: 'My loop' },
    queue: { ids: ['a', 'b', 'c'], since: 1, startsOn: '2026-10-01', label: 'My loop', rotationId: 'rot' },
    scheduleMode: 'rotation', week: {}, dayPlan: { '2099-01-01': 'b' },
  })
  const setSeq = next => setLoop(next, 'My loop')

  it('takes the routine out, and Undo puts the loop and its pin back exactly', () => {
    load(loop())
    expect(takeOutOfLoop('b', setSeq, ['a', 'b', 'c'], 'My loop')).toBe(true)
    expect(S().queue.ids).toEqual(['a', 'c'])
    expect(S().rotation.sequence).toEqual(['a', 'c'])
    expect(S().dayPlan).toEqual({})
    expect(S().routines).toHaveLength(3)
    expect(useUI.getState().toastMsg).toBe(t('“{0}” is out of the loop.', 'Pull A'))
    undo()
    expect(S().queue).toEqual(loop().queue)
    expect(S().rotation).toEqual(loop().rotation)
    expect(S().dayPlan).toEqual(loop().dayPlan)
  })

  it('an id not in the loop does nothing', () => {
    load(loop())
    expect(takeOutOfLoop('zz', setSeq, ['a', 'b', 'c'], 'My loop')).toBe(false)
    expect(S().queue.ids).toEqual(['a', 'b', 'c'])
  })

  it('Undo after the loop changed again slots the routine back at its old place', () => {
    load(loop())
    takeOutOfLoop('b', setSeq, ['a', 'b', 'c'], 'My loop')
    const pending = useUI.getState().toastAction
    useStore.getState().update(s => { s.queue = Object.assign({}, s.queue, { ids: ['c', 'a'] }); s.rotation = Object.assign({}, s.rotation, { sequence: ['c', 'a'] }) })
    pending.run()
    expect(S().queue.ids).toEqual(['c', 'b', 'a'])
    expect(S().rotation.sequence).toEqual(['c', 'b', 'a'])
  })

  it('Undo after switching to Fixed week puts it back in the saved loop and stays on Fixed week', () => {
    load(loop())
    takeOutOfLoop('b', setSeq, ['a', 'b', 'c'], 'My loop')
    const pending = useUI.getState().toastAction
    useStore.getState().update(s => { chooseFixedWeek(s) })
    pending.run()
    expect(S().queue).toBeNull()
    expect(scheduleModeOf(S())).toBe('week')
    expect(S().rotation.sequence).toEqual(['a', 'b', 'c'])
  })

  it('taking out the last routine stays on Rotation with an empty loop; Undo after Fixed week refills the saved loop', () => {
    const l = loop()
    load(Object.assign(l, { rotation: Object.assign(l.rotation, { sequence: ['a'] }), queue: Object.assign(l.queue, { ids: ['a'] }) }))
    takeOutOfLoop('a', setSeq, ['a'], 'My loop')
    expect(S().queue).toBeNull()
    expect(S().rotation.sequence).toEqual([])
    expect(S().scheduleMode).toBe('rotation')
    const pending = useUI.getState().toastAction
    useStore.getState().update(s => { chooseFixedWeek(s) })
    pending.run()
    expect(S().queue).toBeNull()
    expect(scheduleModeOf(S())).toBe('week')
    expect(S().rotation.sequence).toEqual(['a'])
  })

  it('a coach’s queue written meanwhile is left alone by the Undo', () => {
    load(loop())
    takeOutOfLoop('b', setSeq, ['a', 'b', 'c'], 'My loop')
    const pending = useUI.getState().toastAction
    const coach = { ids: ['c', 'a'], since: 5, startsOn: '2026-10-02', label: 'Coach' }
    useStore.getState().update(s => { s.queue = clone(coach) })
    pending.run()
    expect(S().queue).toEqual(coach)
    expect(S().rotation.sequence).toEqual(['a', 'b', 'c'])
  })

  it('Undo for a routine deleted meanwhile says it is too late', () => {
    load(loop())
    takeOutOfLoop('b', setSeq, ['a', 'b', 'c'], 'My loop')
    const pending = useUI.getState().toastAction
    useStore.getState().update(s => { deleteRoutine(s, 'b') })
    pending.run()
    expect(S().queue.ids).toEqual(['a', 'c'])
    expect(useUI.getState().toastMsg).toBe(t('Too late, that one’s gone'))
  })

  it('undoTakeOut with a stale mark and the routine already back changes nothing', () => {
    load(loop())
    const before = clone(S())
    expect(undoTakeOut({ id: 'b', at: 1, label: 'My loop', snap: { rotation: null, queue: null, dayPlan: {} }, mark: 'stale', marks: null })).toBe(true)
    expect(S().queue).toEqual(before.queue)
    expect(S().rotation).toEqual(before.rotation)
  })

  it('loopMark reads the saved loop, the pass and the mode switch', () => {
    load(loop())
    const m = loopMark(S())
    useStore.getState().update(s => { s.restSec = 99 })
    expect(loopMark(S())).toBe(m)
    useStore.getState().update(s => { s.scheduleMode = 'week' })
    expect(loopMark(S())).not.toBe(m)
  })
})

describe('setLoop', () => {
  it('creates the rotation and its pass on the first save, with no name of its own', () => {
    load({ scheduleMode: 'rotation' })
    setLoop(['a'], '')
    expect(S().rotation.sequence).toEqual(['a'])
    expect(S().rotation.label).toBe('')
    expect(S().queue.ids).toEqual(['a'])
    expect(S().queue.rotationId).toBe(S().rotation.id)
  })

  it('a reorder keeps the pass’s since', () => {
    load({ rotation: { id: 'r1', sequence: ['a', 'b'], label: '' }, queue: { ids: ['a', 'b'], since: 123, startsOn: '2026-10-01', label: '', rotationId: 'r1' }, scheduleMode: 'rotation' })
    setLoop(['b', 'a'], '')
    expect(S().queue.ids).toEqual(['b', 'a'])
    expect(S().queue.since).toBe(123)
    expect(S().rotation.id).toBe('r1')
  })
})
