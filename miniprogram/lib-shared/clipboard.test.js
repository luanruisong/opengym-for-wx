import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText, readText } from './clipboard.js'

afterEach(() => vi.unstubAllGlobals())

describe('clipboard', () => {
  it('copies through wx.setClipboardData and says it did', async () => {
    const seen = []
    vi.stubGlobal('wx', { setClipboardData: o => { seen.push(o.data); o.success() } })
    expect(await copyText('hello')).toBe(true)
    expect(seen).toEqual(['hello'])
  })

  it('says false when it was refused, threw, or there is no wx', async () => {
    vi.stubGlobal('wx', { setClipboardData: o => o.fail({}) })
    expect(await copyText('x')).toBe(false)
    vi.stubGlobal('wx', { setClipboardData: () => { throw new Error('no') } })
    expect(await copyText('x')).toBe(false)
    vi.stubGlobal('wx', undefined)
    expect(await copyText('x')).toBe(false)
  })

  it('reads the clipboard text, or null when it could not', async () => {
    vi.stubGlobal('wx', { getClipboardData: o => o.success({ data: 'abc' }) })
    expect(await readText()).toBe('abc')
    vi.stubGlobal('wx', { getClipboardData: o => o.fail({}) })
    expect(await readText()).toBe(null)
  })
})
