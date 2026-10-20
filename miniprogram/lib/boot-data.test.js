import { describe, expect, it, vi } from 'vitest'

// boot-data.js under a fake require.async that serves the real data subpackages.
describe('loadCoreData', () => {
  it('loads the catalogue, the Chinese names and the zh locale; the details on first ask', async () => {
    vi.resetModules()
    const asked = []
    const files = {
      '../data-ex/exercises-data.js': () => import('../data-ex/exercises-data.js'),
      '../data-ex/names-zh.js': () => import('../data-ex/names-zh.js'),
      '../data-ex/body-paths.js': () => import('../data-ex/body-paths.js'),
      '../data-instr-zh/instr-zh.js': () => import('../data-instr-zh/instr-zh.js'),
      '../data-instr-en/instr-en.js': () => import('../data-instr-en/instr-en.js'),
      '../data-desc-en/desc-en.js': () => import('../data-desc-en/desc-en.js'),
    }
    try {
      const { loadCoreData, _setAsyncLoader } = await import('./boot-data.js')
      _setAsyncLoader(p => { asked.push(p); return files[p]() })
      const ex = await import('./exercises.js')
      const i18n = await import('./i18n.js')
      await loadCoreData()
      expect(ex.CATALOGUE.length).toBeGreaterThan(1000)
      expect(ex.EXIDX['0025']).toBeTruthy()
      expect(i18n.getLang()).toBe('zh')
      expect(i18n.t('Cancel')).toBe('取消')
      expect(i18n.exerciseNameFor(ex.EXIDX['0025'])).toMatch(/[一-鿿]/)
      expect(asked).not.toContain('../data-instr-en/instr-en.js')
      expect(i18n.instrFor(ex.EXIDX['0025'])).toEqual(ex.EXIDX['0025'].st || [])
      expect(asked).toContain('../data-instr-zh/instr-zh.js')
      await vi.waitFor(() => expect(i18n.instrFor(ex.EXIDX['0025']).join('')).toMatch(/[\u4e00-\u9fff]/), { timeout: 5000 })
      await vi.waitFor(() => expect(i18n.descFor(ex.EXIDX['0025']).length).toBeGreaterThan(0), { timeout: 5000 })
    } finally { /* nothing to undo: modules are reset per test */ }
  })
})
