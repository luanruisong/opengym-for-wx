// Owner's call (1.3.10): an empty value reads as an en dash, "–", never the em dash "—", which
// the app's copy no longer uses anywhere. Stats tiles, the Coach's tiles, the admin counts and a
// per-side set label's untouched side ("R –") all show one; a new one written as '—' fails here.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The mini program's own source (this test lives in miniprogram-dev/lib).
const SRC = fileURLToPath(new URL('../../miniprogram', import.meta.url))
const files = dir => readdirSync(dir).flatMap(n => {
  const p = join(dir, n)
  if (statSync(p).isDirectory()) return ['locales', 'node_modules'].includes(n) || n.startsWith('data-') ? [] : files(p)
  return /\.(js|wxml)$/.test(n) && !/\.test\./.test(n) ? [p] : []
})

describe('empty-value placeholders', () => {
  it('are an en dash in every source file', () => {
    const offenders = files(SRC).flatMap(p => readFileSync(p, 'utf8').split('\n')
      .map((line, i) => (/(['"`])—\1/.test(line) ? `${p.slice(SRC.length + 1)}:${i + 1}` : null)).filter(Boolean))
    expect(offenders).toEqual([])
  })
})
