// Every lib module loads before the catalogue is in (the mini program imports them at launch,
// boot-data.js fills the catalogue later): nothing may throw at import, and what is derived from
// the catalogue fills in once initExercises runs.
import { describe, expect, it, vi } from 'vitest'
import { readdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXDB, EXALIAS } from '../data-ex/exercises-data.js'

const here = dirname(fileURLToPath(import.meta.url))
const modules = readdirSync(here).filter(f => f.endsWith('.js') && !/\.test\.js$|test-util/.test(f))

describe('lib modules', () => {
  it('all import with an empty catalogue, and fill in after initExercises', async () => {
    vi.resetModules()
    const ex = await import('./exercises.js')
    expect(ex.CATALOGUE.length).toBe(0)
    for (const f of modules) await import('./' + f)
    const eq = await import('./equipment.js')
    expect(eq.ALL_EQUIPMENT.length).toBe(0)
    ex.initExercises({ EXDB, EXALIAS })
    expect(ex.CATALOGUE.length).toBe(EXDB.length)
    expect(ex.BODYPARTS.length).toBeGreaterThan(5)
    expect(eq.ALL_EQUIPMENT).toContain('barbell')
    expect(ex.exercisesReady()).toBe(true)
  })
})
