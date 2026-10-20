import { describe, it, expect, beforeEach } from 'vitest'
import { fsBackend, toBase64, sha256OfFile, readHead } from './media-store-fs.js'
import { createMediaStore } from './media-store.js'
import { sha256Hex } from './sha256.js'
import { jpeg, mp4 } from './media-samples.test-util.js'
import { installWxMock } from '../tools/wx-mock.js'

// The wx file system from tools/wx-mock.js, fresh for every test.
const DIR = 'wxfile://usr/opengym-media'
let files
beforeEach(() => { installWxMock(); files = wx.__files })
const tick = ms => new Promise(r => setTimeout(r, ms))
const indexOf = () => JSON.parse(Buffer.from(files.get(DIR + '/index.json')).toString('utf8'))

describe('the wx file system backend', () => {
  it('writes through a .part file renamed into place, names a MOV .mp4, and lists it after the index', async () => {
    const be = fsBackend({ debounceMs: 5 })
    expect(await be.open()).toBe(true)
    const big = new Uint8Array(5 * 1024 * 1024)
    for (let i = 0; i < big.length; i++) big[i] = i & 0xff
    const hash = await sha256Hex(big)
    await be.put({ hash, mime: 'video/quicktime', size: big.length, putAt: 1, shownAt: 0, pending: true, rejected: false }, big)
    expect(await sha256Hex(files.get(`${DIR}/${hash}.mp4`))).toBe(hash)
    expect(files.has(`${DIR}/${hash}.mp4.part`)).toBe(false)
    expect(be.filePath(hash)).toBe(`${DIR}/${hash}.mp4`)
    expect(await be.fileUrl(hash)).toBe(`${DIR}/${hash}.mp4`)
    expect(await sha256Hex(await be.getBlob(hash))).toBe(hash)
    // Hashed from disk in pieces, the same answer.
    expect(sha256OfFile(`${DIR}/${hash}.mp4`)).toBe(hash)
    expect([...readHead(`${DIR}/${hash}.mp4`, 4)]).toEqual([0, 1, 2, 3])
    await tick(20)
    expect(indexOf()[hash]).toMatchObject({ mime: 'video/quicktime', pending: true })
  })

  it('putFile copies a temp file in and takes its size from the disk', async () => {
    const be = fsBackend({ debounceMs: 5 })
    await be.open()
    const photo = jpeg()
    wx.getFileSystemManager().writeFileSync('http://tmp/abc.jpg', photo.buffer)
    const h = await sha256Hex(photo)
    const size = await be.putFile({ hash: h, mime: 'image/jpeg', size: 0, putAt: 1, shownAt: 0, pending: true, rejected: false }, 'http://tmp/abc.jpg')
    expect(size).toBe(photo.length)
    expect(files.has('http://tmp/abc.jpg')).toBe(true)   // copied, the temp file is the caller's
    expect(await sha256Hex(files.get(`${DIR}/${h}.jpg`))).toBe(h)
  })

  it('on start, keeps a file the index never listed as pending, and drops what points at nothing', async () => {
    const photo = jpeg()
    const video = mp4().file
    const ph = await sha256Hex(photo)
    const vh = await sha256Hex(video)
    const gone = 'f'.repeat(64)
    files.set(`${DIR}/${ph}.jpg`, photo)
    files.set(`${DIR}/${vh}.mp4`, video)
    files.set(`${DIR}/${'e'.repeat(64)}.jpg`, photo)         // bytes that do not match the name
    files.set(`${DIR}/${'d'.repeat(64)}.webp.part`, photo)   // half a write
    files.set(`${DIR}/index.json`, new Uint8Array(Buffer.from(JSON.stringify({
      [vh]: { hash: vh, mime: 'video/mp4', size: video.length, putAt: 5, shownAt: 0, pending: false, rejected: false },
      [gone]: { hash: gone, mime: 'image/webp', size: 10, putAt: 5, shownAt: 0, pending: false, rejected: false }
    }))))
    const be = fsBackend({ debounceMs: 5 })
    await be.open()
    const recs = Object.fromEntries((await be.all()).map(r => [r.hash, r]))
    expect(Object.keys(recs).sort()).toEqual([ph, vh].sort())
    expect(recs[ph]).toMatchObject({ mime: 'image/jpeg', size: photo.length, pending: true })
    expect(recs[vh]).toMatchObject({ pending: false })
    expect(files.has(`${DIR}/${'e'.repeat(64)}.jpg`)).toBe(false)
    expect(files.has(`${DIR}/${'d'.repeat(64)}.webp.part`)).toBe(false)
    expect(Object.keys(indexOf()).sort()).toEqual([ph, vh].sort())
  })

  it('removes the file before the index entry, and clear empties the folder', async () => {
    const be = fsBackend({ debounceMs: 5 })
    await be.open()
    const photo = jpeg()
    const h = await sha256Hex(photo)
    await be.put({ hash: h, mime: 'image/jpeg', size: photo.length, putAt: 1, shownAt: 0, pending: true, rejected: false }, photo)
    await be.remove(h)
    expect(files.has(`${DIR}/${h}.jpg`)).toBe(false)
    expect(await be.all()).toEqual([])
    await be.put({ hash: h, mime: 'image/jpeg', size: photo.length, putAt: 1, shownAt: 0, pending: true, rejected: false }, photo)
    await be.clear()
    expect([...files.keys()].filter(k => k.startsWith(DIR + '/') && !k.endsWith('index.json'))).toEqual([])
  })

  it('answers false when there is no file system at all, and the store then falls back to memory', async () => {
    const be = fsBackend({ fs: () => { throw new Error('no wx') } })
    expect(await be.open()).toBe(false)
    const s = createMediaStore(fsBackend({ fs: () => null }))
    await s.ready()
    expect(s.backendName).toBe('memory')
    expect(s.persistent).toBe(false)
  })

  it('through the store: url() and pathNow() are the file path, and a second open reads the index back', async () => {
    const photo = jpeg()
    const h = await sha256Hex(photo)
    const s = createMediaStore(fsBackend({ debounceMs: 1 }))
    await s.put(h, photo.buffer, { mime: 'image/jpeg' })
    expect(await s.url(h)).toBe(`${DIR}/${h}.jpg`)
    expect(s.pathNow(h)).toBe(`${DIR}/${h}.jpg`)
    expect((await s.get(h)).path).toBe(`${DIR}/${h}.jpg`)
    await tick(10)
    const again = createMediaStore(fsBackend())
    expect(await again.has(h)).toBe(true)
  })
})

describe('toBase64', () => {
  it('matches Buffer on every padding length', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 1000]) {
      const b = new Uint8Array(n).map((_, i) => (i * 37) & 0xff)
      expect(toBase64(b)).toBe(Buffer.from(b).toString('base64'))
    }
  })
})
