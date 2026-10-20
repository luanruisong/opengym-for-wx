import { describe, it, expect } from 'vitest'
import { zipStore, readZip, looksLikeZip, crc32, ZipError, MAX_ENTRIES, MAX_TOTAL, utf8Encode, utf8Decode } from './zip.js'

const cat = parts => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length } return out }

// A zip laid out by hand: one local header and central record per entry, for the refusals.
function handZip(entries, { method = 0, flags = 0x0800, count } = {}) {
  const enc = new TextEncoder()
  const parts = [], cd = []
  let off = 0
  for (const { name, data } of entries) {
    const n = enc.encode(name)
    const lh = new DataView(new ArrayBuffer(30))
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(6, flags, true); lh.setUint16(8, method, true)
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, n.length, true)
    parts.push(new Uint8Array(lh.buffer), n, data)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true); c.setUint16(8, flags, true); c.setUint16(10, method, true)
    c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, n.length, true); c.setUint32(42, off, true)
    cd.push(new Uint8Array(c.buffer), n)
    off += 30 + n.length + data.length
  }
  const cdSize = cd.reduce((s, p) => s + p.length, 0)
  const e = new DataView(new ArrayBuffer(22))
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, count ?? entries.length, true); e.setUint16(10, count ?? entries.length, true)
  e.setUint32(12, cdSize, true); e.setUint32(16, off, true)
  return cat([...parts, ...cd, new Uint8Array(e.buffer)])
}
const refusal = async blob => { try { await readZip(blob); return null } catch (e) { return e instanceof ZipError ? e.code : 'other' } }

describe('zip', () => {
  it('the CRC of "abc" is 0x352441C2', () => {
    expect(crc32(utf8Encode('abc'))).toBe(0x352441c2)
  })

  it('round-trips names (UTF-8 included) and bytes, and says it is a zip', async () => {
    const bin = new Uint8Array(70000).map((_, i) => i & 0xff)
    const z = await zipStore([
      { name: 'opengym-backup.json', data: '{"workouts":[]}' },
      { name: 'media/übung.bin', data: bin },
      { name: 'empty.txt', data: new Uint8Array(0) }
    ])
    expect(z).toBeInstanceOf(ArrayBuffer)
    expect(await looksLikeZip(z)).toBe(true)
    expect(await looksLikeZip(utf8Encode('{"a":1}'))).toBe(false)
    const back = await readZip(z)
    expect(back.map(e => [e.name, e.size])).toEqual([['opengym-backup.json', 15], ['media/übung.bin', 70000], ['empty.txt', 0]])
    expect(utf8Decode(back[0].bytes)).toBe('{"workouts":[]}')
    expect(new Uint8Array(back[1].bytes)).toEqual(bin)
  })

  it('refuses a compressed entry, an encrypted one, a name that climbs out, and too many entries', async () => {
    const data = new Uint8Array([1, 2, 3])
    expect(await refusal(handZip([{ name: 'a.txt', data }], { method: 8 }))).toBe('compressed')
    expect(await refusal(handZip([{ name: 'a.txt', data }], { flags: 0x0801 }))).toBe('encrypted')
    expect(await refusal(handZip([{ name: '../../evil.sh', data }]))).toBe('bad-name')
    expect(await refusal(handZip([{ name: 'media/../x', data }]))).toBe('bad-name')
    expect(await refusal(handZip([{ name: '/etc/passwd', data }]))).toBe('bad-name')
    expect(await refusal(handZip([{ name: 'a.txt', data }], { count: MAX_ENTRIES + 1 }))).toBe('too-many')
    expect(await refusal(utf8Encode('not a zip at all'))).toBe('not-zip')
  })

  it('refuses an export above the import size limit before reading the file', async () => {
    const data = { byteLength: MAX_TOTAL + 1 }
    await expect(zipStore([{ name: 'media/large.mp4', data }])).rejects.toMatchObject({ code: 'too-large' })
  })
})

describe('utf8', () => {
  it('matches TextEncoder/TextDecoder on mixed text, emoji included', () => {
    const str = 'abc übung 卧推 💪 \u0000 end'
    expect(utf8Encode(str)).toEqual(new TextEncoder().encode(str))
    expect(utf8Decode(new TextEncoder().encode(str))).toBe(str)
    expect(utf8Decode(new Uint8Array([0xff, 0x41]))).toBe('\ufffdA')
  })
})
