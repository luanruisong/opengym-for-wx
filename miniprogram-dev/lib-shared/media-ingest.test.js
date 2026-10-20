// The ingest's own decisions, with wx.compressImage / wx.getImageInfo swapped for stand-ins and
// files living in the mocked wx file system (tools/wx-mock.js): which path a file takes, what is
// refused and why, what the ref says, and that what goes into the store is the scrubbed file
// under its own hash.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ingestMediaFile, storeIngested, encodeImage } from './media-ingest.js'
import { createMediaStore, memoryBackend } from '../../miniprogram/lib/media-store.js'
import { sha256Hex } from '../../miniprogram/lib/sha256.js'
import { bytes, latin1, fill, jpeg, png, gif, gce, frame, comment, appExt, box, mp4, webm } from '../lib/media-samples.test-util.js'
import { installWxMock } from '../tools/wx-mock.js'

const MB = 1024 * 1024
const LIMITS = { imageMB: 2, rawPhotoMB: 40, gifMB: 8, videoMB: 40, videoSec: 60 }
const webpBytes = (n = 100) => bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8 ', fill(n))
const has = (data, needle) => {
  const hay = new Uint8Array(data)
  const n = latin1(needle)
  outer: for (let i = 0; i + n.length <= hay.length; i++) { for (let k = 0; k < n.length; k++) if (hay[i + k] !== n[k]) continue outer; return true }
  return false
}
let seq = 0
const put = (b, name = 'f') => { const p = `http://tmp/${++seq}-${name}`; wx.getFileSystemManager().writeFileSync(p, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); return p }
const file = (b, extra = {}) => ({ tempFilePath: put(b), size: b.length, ...extra })

// compressImage writes a WebP of `width` bytes-ish; the dims come from the scale encodeImage works out.
function deps(over = {}) {
  return {
    compressImage: vi.fn(async (src, { width }) => put(webpBytes(width || 50), 'c.webp')),
    imageInfo: vi.fn(async () => ({ width: 4032, height: 3024 })),
    ...over
  }
}

beforeEach(() => { installWxMock() })

describe('photos', () => {
  it('re-encodes to at most 1600 px plus a 480 px poster, and keeps neither the file nor its name', async () => {
    const d = deps()
    const out = await ingestMediaFile(file(jpeg(4032, 3024)), LIMITS, d)
    expect(d.compressImage.mock.calls.map(c => c[1].width)).toEqual([1600, 480])
    expect(out.media).toMatchObject({ kind: 'image', mime: 'image/webp', width: 1600, height: 1200, poster: { mime: 'image/webp', width: 480, height: 360 } })
    expect(out.files).toHaveLength(2)
    expect(out.blobs).toBe(out.files)
    const fs = wx.getFileSystemManager()
    expect(out.media.hash).toBe(await sha256Hex(fs.readFileSync(out.files[0].path)))
    expect(out.media.poster.hash).toBe(await sha256Hex(fs.readFileSync(out.files[1].path)))
    expect(out.warnings).toEqual([])
  })

  it('refuses a photo over 52 megapixels on its header, before re-encoding it', async () => {
    const d = deps()
    await expect(ingestMediaFile(file(jpeg(9000, 7000)), LIMITS, d)).rejects.toMatchObject({ code: 'photo-too-big' })
    expect(d.compressImage).not.toHaveBeenCalled()
  })

  it('finds the frame header of a JPEG behind more than 256 KB of APP segments, and refuses it before re-encoding', async () => {
    const d = deps()
    const app = () => bytes([0xff, 0xe2], [0xff, 0xff], fill(0xffff - 2))
    const big = jpeg(9000, 7000)
    const padded = bytes(big.subarray(0, 2), app(), app(), app(), app(), app(), big.subarray(2))
    await expect(ingestMediaFile(file(padded), LIMITS, d)).rejects.toMatchObject({ code: 'photo-too-big' })
    expect(d.compressImage).not.toHaveBeenCalled()
  })

  it('refuses a raw photo over its cap, and steps the quality down before refusing an encoded one', async () => {
    await expect(ingestMediaFile(file(bytes(jpeg(), fill(41 * MB))), LIMITS, deps())).rejects.toMatchObject({ code: 'too-large', mb: 40 })
    const d = deps({ compressImage: vi.fn(async () => put(bytes(webpBytes(10), fill(3 * MB)), 'big.webp')) })
    await expect(ingestMediaFile(file(png()), LIMITS, d)).rejects.toMatchObject({ code: 'too-large', mb: 2 })
    expect(d.compressImage.mock.calls.map(c => c[1].quality)).toEqual([85, 70, 70, 60])
  })

  it('reads a HEIC as a photo to re-encode, its size from getImageInfo', async () => {
    const d = deps()
    const heic = bytes(box('ftyp', 'heic', [0, 0, 0, 0], 'mif1heic'), fill(100))
    const out = await ingestMediaFile(file(heic), LIMITS, d)
    expect(d.imageInfo).toHaveBeenCalled()
    expect(out.media.mime).toBe('image/webp')
  })

  it('refuses what is not a photo, a GIF or a video, whatever it is called', async () => {
    await expect(ingestMediaFile(file(latin1('<svg onload="alert(1)"/>')), LIMITS, deps())).rejects.toMatchObject({ code: 'type' })
    await expect(ingestMediaFile(file(latin1('%PDF-1.7')), LIMITS, deps())).rejects.toMatchObject({ code: 'type' })
  })

  it('says so when the platform cannot re-encode it, or hands back something that is no image', async () => {
    const fail = deps({ compressImage: vi.fn(async () => { throw new Error('fail') }) })
    await expect(ingestMediaFile(file(png()), LIMITS, fail)).rejects.toMatchObject({ code: 'unreadable' })
    const html = deps({ compressImage: vi.fn(async () => put(latin1('<html>'), 'x.jpg')) })
    await expect(ingestMediaFile(file(png()), LIMITS, html)).rejects.toMatchObject({ code: 'unreadable' })
  })

  it('a poster the platform writes as PNG is dropped, the photo kept', async () => {
    let n = 0
    const d = deps({ compressImage: vi.fn(async () => (++n === 1 ? put(webpBytes(10), 'm.webp') : put(png(480, 360), 'p.png'))) })
    const out = await ingestMediaFile(file(png(800, 600)), LIMITS, d)
    expect(out.media.poster).toBeUndefined()
    expect(out.files).toHaveLength(1)
  })
})

describe('GIFs', () => {
  it('keeps the animation without its comment, with a poster and a length', async () => {
    const g = gif({ w: 40, h: 30, blocks: [appExt('NETSCAPE2.0', bytes([1, 0, 0])), comment('made at home'), gce(50), frame(40, 30), gce(70), frame(40, 30)] })
    const out = await ingestMediaFile(file(g), LIMITS, deps())
    expect(out.media).toMatchObject({ kind: 'gif', mime: 'image/gif', width: 40, height: 30, dur: 1.2 })
    expect(has(out.files[0].data, 'made at home')).toBe(false)
    expect(has(out.files[0].data, 'NETSCAPE2.0')).toBe(true)
    expect(out.media.hash).toBe(await sha256Hex(out.files[0].data))
    expect(out.media.poster.mime).toBe('image/webp')
  })

  it('a GIF of one frame is a photo', async () => {
    const out = await ingestMediaFile(file(gif({ delays: [10] })), LIMITS, deps())
    expect(out.media).toMatchObject({ kind: 'image', mime: 'image/webp' })
  })

  it('refuses an animation over 52 megapixels on its header, before making a poster', async () => {
    const d = deps()
    const g = gif({ w: 16000, h: 16000, blocks: [gce(10), frame(1, 1), gce(10), frame(1, 1)] })
    await expect(ingestMediaFile(file(g), LIMITS, d)).rejects.toMatchObject({ code: 'photo-too-big' })
    expect(d.compressImage).not.toHaveBeenCalled()
  })

  it('refuses one over the GIF cap', async () => {
    await expect(ingestMediaFile(file(bytes(gif(), fill(9 * MB))), LIMITS, deps())).rejects.toMatchObject({ code: 'too-large', mb: 8 })
  })
})

describe('videos', () => {
  const withGps = (over = {}) => mp4({
    tracks: [{ handler: 'vide', fourcc: 'avc1', w: 1920, h: 1080, payload: fill(64, 0x77) }, { handler: 'meta', fourcc: 'gpmd', payload: latin1('+47.37+008.54/') }],
    moovExtra: [box('udta', box('\xa9xyz', latin1('+47.37+008.54/')))],
    ...over
  }).file
  const thumb = () => put(jpeg(480, 270), 'thumb.jpg')

  it('an MP4 is stored scrubbed, under the hash of what is stored, with length, size, codec and chooseMedia\'s poster', async () => {
    const out = await ingestMediaFile(file(withGps({ seconds: 12.5 }), { thumbTempFilePath: thumb() }), LIMITS, deps())
    expect(out.media).toMatchObject({ kind: 'video', mime: 'video/mp4', width: 1920, height: 1080, dur: 12.5, codec: 'avc1', poster: { mime: 'image/jpeg', width: 480, height: 270 } })
    const stored = out.files[0].data
    expect(has(stored, '47.37')).toBe(false)
    expect(out.media.hash).toBe(await sha256Hex(stored))
    expect(out.files[1].path).toBeTruthy()
    expect(out.warnings).toEqual([])
  })

  it('a MOV stays a MOV', async () => {
    const out = await ingestMediaFile(file(withGps({ brand: 'qt  ' })), LIMITS, deps())
    expect(out.media.mime).toBe('video/quicktime')
  })

  it('refuses one longer than the cap, one bigger than the cap, and one that does not parse', async () => {
    await expect(ingestMediaFile(file(withGps({ seconds: 75 })), LIMITS, deps())).rejects.toMatchObject({ code: 'too-long', sec: 60 })
    await expect(ingestMediaFile(file(withGps({ seconds: 61 })), LIMITS, deps())).resolves.toBeTruthy()   // the server's +1 s
    await expect(ingestMediaFile(file(bytes(withGps(), fill(41 * MB))), LIMITS, deps())).rejects.toMatchObject({ code: 'too-large', mb: 40 })
    const broken = withGps()
    await expect(ingestMediaFile(file(broken.subarray(0, broken.length - 20)), LIMITS, deps())).rejects.toMatchObject({ code: 'unreadable' })
  })

  it('HEVC is kept with the warning that it may not play everywhere', async () => {
    const hevc = mp4({ tracks: [{ handler: 'vide', fourcc: 'hvc1', w: 1920, h: 1080, payload: fill(10) }] }).file
    const out = await ingestMediaFile(file(hevc), LIMITS, deps())
    expect(out.media.codec).toBe('hvc1')
    expect(out.warnings).toEqual(['codec'])
  })

  it('without a thumbnail from chooseMedia it is kept without a poster', async () => {
    const out = await ingestMediaFile(file(withGps()), LIMITS, deps())
    expect(out.media.poster).toBeUndefined()
    expect(out.files).toHaveLength(1)
  })

  it('a WebM is kept as it is, its size and codec read from its header, always with the warning', async () => {
    const w = webm({ w: 1280, h: 720, codec: 'V_VP9', durationMs: 5000 })
    const out = await ingestMediaFile(file(w), LIMITS, deps())
    expect(out.media).toMatchObject({ kind: 'video', mime: 'video/webm', width: 1280, height: 720, codec: 'vp9', dur: 5 })
    expect(out.media.hash).toBe(await sha256Hex(w))
    expect(out.warnings).toEqual(['codec'])
  })

  it('a length the file does not state comes from chooseMedia, and is checked the same', async () => {
    const w = webm({ durationMs: null })
    const out = await ingestMediaFile(file(w, { duration: 12.5 }), LIMITS, deps())
    expect(out.media.dur).toBe(12.5)
    await expect(ingestMediaFile(file(w, { duration: 90 }), LIMITS, deps())).rejects.toMatchObject({ code: 'too-long' })
    const unknown = await ingestMediaFile(file(w), LIMITS, deps())
    expect(unknown.media.dur).toBeUndefined()
  })
})

describe('storeIngested', () => {
  it('copies files in, puts bytes, all pending, and deletes the temp files it made', async () => {
    const media = createMediaStore(memoryBackend())
    const out = await ingestMediaFile(file(jpeg(4032, 3024)), LIMITS, deps())
    const ref = await storeIngested(out, { media })
    expect(ref).toBe(out.media)
    expect(await media.get(ref.hash)).toMatchObject({ mime: 'image/webp', pending: true })
    expect(await media.has(ref.poster.hash)).toBe(true)
    expect(wx.__files.has(out.files[0].path)).toBe(false)
    const v = await ingestMediaFile(file(mp4().file), LIMITS, deps())
    await storeIngested(v, { media })
    expect((await media.get(v.media.hash)).size).toBe(v.media.size)
  })
})

describe('encodeImage', () => {
  it('works out the size from the scale, or reads it from the result when it has none', async () => {
    const d = deps()
    const src = put(png(10, 10))
    expect(await encodeImage(src, { width: 3200, height: 1600 }, 1600, 0.8, d)).toMatchObject({ mime: 'image/webp', width: 1600, height: 800 })
    const d2 = deps({ compressImage: vi.fn(async () => put(png(33, 22), 'x.png')) })
    expect(await encodeImage(src, null, 480, 0.8, d2)).toMatchObject({ mime: 'image/png', width: 33, height: 22 })
  })
})
