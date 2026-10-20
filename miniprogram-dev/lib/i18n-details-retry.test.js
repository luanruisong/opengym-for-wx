/* The English steps and descriptions come from their own subpackages the first time an exercise
   is shown (boot-data.js registers the loader with setDetailsSource). A load that failed used to
   leave them empty and never ask again; now the next reader after a pause tries again.
   Mini program port: the source is a function instead of Vite's dynamic import, and there is no
   browser 'online' event. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const net = { up: false, loads: 0 }
const ex = { id: '9999', st: [] }

let i18n
beforeEach(async () => {
  vi.resetModules()
  net.up = false
  net.loads = 0
  i18n = await import('../../miniprogram/lib/i18n.js')
  i18n.setDetailsSource(async () => {
    net.loads++
    if (!net.up) throw new Error('subpackage failed to load')
    return { zhInstr: null, enInstr: { 9999: ['Stand tall.', 'Lift.'] }, enDesc: { 9999: 'A lift.' } }
  })
})
afterEach(() => { vi.useRealTimers() })

describe('a failed load of the English steps', () => {
  it('is not mistaken for no steps: tried again on the next ask after a pause', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    expect(i18n.instrFor(ex)).toEqual([])
    await vi.advanceTimersByTimeAsync(0)
    expect(net.loads).toBe(1)
    // asked again at once (every render asks): no new try yet
    i18n.instrFor(ex)
    await vi.advanceTimersByTimeAsync(0)
    expect(net.loads).toBe(1)
    net.up = true
    await vi.advanceTimersByTimeAsync(20000)
    expect(net.loads).toBe(1)          // nothing asked yet: no load on its own
    i18n.instrFor(ex)
    await vi.advanceTimersByTimeAsync(0)
    expect(i18n.instrFor(ex)).toEqual(['Stand tall.', 'Lift.'])
    expect(i18n.descFor(ex)).toBe('A lift.')
  })

  it('notifies onLangChange subscribers once the details are in', async () => {
    net.up = true
    const seen = []
    const off = i18n.onLangChange(v => seen.push(v))
    i18n.instrFor(ex)
    for (let i = 0; i < 5; i++) await Promise.resolve()
    await new Promise(r => setTimeout(r, 0))
    expect(seen.length).toBeGreaterThan(0)
    off()
  })
})

describe('Chinese', () => {
  it('setLang("zh") reads the bundled zh pack, Chinese names and Chinese steps', async () => {
    await i18n.setLang('zh')
    expect(i18n.getLang()).toBe('zh')
    expect(i18n.t('Cancel')).toBe('取消')
    i18n.setExerciseNames({ 9999: '测试动作' })
    expect(i18n.exerciseNameFor({ id: '9999', n: 'test lift' })).toBe('测试动作 (test lift)')
    i18n.setDetailsSource(async () => ({ zhInstr: { 9999: ['站直。'] }, enInstr: {}, enDesc: {} }))
    i18n.instrFor(ex)
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(i18n.instrFor(ex)).toEqual(['站直。'])
    expect(i18n.instrTranslated(ex)).toBe(true)
  })
})
