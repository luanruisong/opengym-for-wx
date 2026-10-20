// Mini program port: the screen is kept on through wx.setKeepScreenOn.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let wl, calls
beforeEach(async () => {
  calls = []
  vi.stubGlobal('wx', { setKeepScreenOn: o => calls.push(o.keepScreenOn) })
  vi.resetModules()
  wl = await import('./wakelock.js')
})
afterEach(() => vi.unstubAllGlobals())

describe('wake lock', () => {
  it('is supported where wx.setKeepScreenOn exists', async () => {
    expect(wl.wakeLockSupported()).toBe(true)
    vi.stubGlobal('wx', undefined)
    expect(wl.wakeLockSupported()).toBe(false)
    expect(() => wl.requestWakeLock()).not.toThrow()
  })

  it('takes the lock once and does not stack a second request', () => {
    wl.requestWakeLock(); wl.requestWakeLock()
    expect(calls).toEqual([true])
    expect(wl.wakeLockHeld()).toBe(true)
  })

  it('releases it, and releasing twice asks nothing more', () => {
    wl.requestWakeLock(); wl.releaseWakeLock(); wl.releaseWakeLock()
    expect(calls).toEqual([true, false])
    expect(wl.wakeLockHeld()).toBe(false)
  })

  it('does not release a lock it never took', () => {
    wl.releaseWakeLock()
    expect(calls).toEqual([])
  })

  it('setKeepAwake follows a boolean, the way useWakeLock(enabled) did', () => {
    wl.setKeepAwake(true); wl.setKeepAwake(true); wl.setKeepAwake(false)
    expect(calls).toEqual([true, false])
  })
})
