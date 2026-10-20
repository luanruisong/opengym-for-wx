/* A picked file → what the state keeps (a MediaRef) and what the local store keeps (the files).
 *
 * MINI PROGRAM PORT. The web app decoded and re-drew every photo on a <canvas> and opened every
 * video in a hidden <video>; neither exists here. The input is one entry of wx.chooseMedia's
 * `tempFiles` ({ tempFilePath, size, width?, height?, duration?, thumbTempFilePath? }) or a bare
 * path, and:
 *  - A photo (JPEG, PNG, WebP, HEIC…) is re-encoded with wx.compressImage at most 1600 px on its
 *    long edge (quality stepping down until it is under the image cap), plus a 480 px poster.
 *    Before that the header's pixel count is checked, as before. NOTE: unlike the canvas, whether
 *    wx.compressImage drops EXIF/GPS is up to the platform; nothing leaves the device here except
 *    in a backup the user exports, so this is accepted.
 *  - A GIF keeps its frames and loses its comment and metadata blocks (media-sniff cleanGif); its
 *    poster is a compressImage of it (the first frame), or none. A GIF of one frame is a photo.
 *  - An MP4/MOV is scrubbed in memory (media-sniff scrubMp4), a WebM kept as it is. Size and length
 *    come from the file's header, else from what wx.chooseMedia reported; the poster is
 *    chooseMedia's `thumbTempFilePath` when it gave one (a JPEG), else there is none.
 *
 * ingestMediaFile resolves { media, files, warnings }: `files` are the main file and its poster
 * as { hash, mime, size, path? , data?, temp? } — `path` a file on disk (copied in with
 * mediaStore.putFile), `data` an ArrayBuffer (mediaStore.put), `temp` a file this module wrote
 * that may be deleted once stored. storeIngested(out) does exactly that. `blobs` is the same
 * array under the web app's name.
 *
 * Every wx call goes through `deps` (lazy defaults), so this imports and is tested in Node.
 */
import { sniffKind, imageDims, inspectGif, cleanGif, inspectMp4, scrubMp4, inspectWebm } from '../lib/media-sniff.js'
import { normalizeMediaRef, MEDIA_MIMES } from '../lib/media-refs.js'
import { sha256Hex } from '../lib/sha256.js'
import { MB, IMAGE_MAX_EDGE, POSTER_EDGE, MAX_PHOTO_MP, DEFAULT_LIMITS } from './media-limits.js'
import { sha256OfFile, readHead, fileSize } from '../lib/media-store-fs.js'
import { mediaStore } from '../lib/media-store.js'

/** A refusal the editor turns into a sentence: code 'type' | 'too-large' (mb) | 'too-long'
 *  (sec) | 'photo-too-big' | 'unreadable'. */
export class MediaError extends Error {
  constructor(code, extra = {}) { super(code); this.code = code; Object.assign(this, extra) }
}

const WARN_CODEC = 'codec'   // the editor's "may not play on every device" line
const round1 = n => Math.round(n * 10) / 10
const POSTER_MIMES = new Set(['image/webp', 'image/jpeg'])

/* ---------------------------------------------------------------- wx parts (swappable) */

const wxFs = () => wx.getFileSystemManager()
const wxCompress = (src, { quality, width }) => new Promise((resolve, reject) => {
  const o = { src, quality, success: r => resolve(r.tempFilePath), fail: reject }
  if (width) o.compressedWidth = width
  wx.compressImage(o)
})
const wxImageInfo = src => new Promise((resolve, reject) => {
  wx.getImageInfo({ src, success: r => resolve({ width: r.width, height: r.height }), fail: reject })
})

/**
 * The photo at `path` (w × h px) re-encoded at most `edge` px on its long side:
 * { path, mime, width, height, size }. Throws MediaError('unreadable') when the platform cannot
 * re-encode it or hands back something that is not a stored image type.
 */
export async function encodeImage(path, dims, edge, quality, deps = {}) {
  const fs = (deps.fs || wxFs)()
  const compress = deps.compressImage || wxCompress
  const scale = dims && dims.width && dims.height ? Math.min(1, edge / Math.max(dims.width, dims.height)) : 1
  const width = dims && dims.width ? Math.max(1, Math.round(dims.width * scale)) : 0
  const height = dims && dims.height ? Math.max(1, Math.round(dims.height * scale)) : 0
  let out
  try { out = await compress(path, { quality: Math.round(quality * 100), width: width || undefined }) } catch { throw new MediaError('unreadable') }
  const size = fileSize(fs, out)
  const sniffed = sniffKind(readHead(out, 64, { fs, size }))
  if (!sniffed || !MEDIA_MIMES[sniffed.mime] || sniffed.kind !== 'image') throw new MediaError('unreadable')
  let w = width, h = height
  if (!w || !h) {
    const d = imageDims(readHead(out, 256 * 1024, { fs, size })) || await (deps.imageInfo || wxImageInfo)(out).catch(() => null)
    if (!d) throw new MediaError('unreadable')
    w = d.width; h = d.height
  }
  return { path: out, mime: sniffed.mime, width: w, height: h, size: size || 0 }
}

/* ---------------------------------------------------------------- photos */

// The photo itself, under the image cap: the quality steps down once and then the size, before
// the photo is refused.
async function encodeMain(path, dims, limits, deps) {
  const cap = limits.imageMB * MB
  for (const [edge, q] of [[IMAGE_MAX_EDGE, 0.85], [IMAGE_MAX_EDGE, 0.7], [1200, 0.7], [960, 0.6]]) {
    const out = await deps.encodeImage(path, dims, edge, q, deps)
    if (out.size <= cap) return out
  }
  throw new MediaError('too-large', { mb: limits.imageMB })
}

async function photo(src, sniffed, limits, deps) {
  if (src.size > limits.rawPhotoMB * MB) throw new MediaError('too-large', { mb: limits.rawPhotoMB })
  const fs = deps.fs()
  let d = null
  if (!sniffed.input) {
    d = imageDims(readHead(src.path, 256 * 1024, { fs, size: src.size }))
    // A JPEG's frame header can sit behind APP segments bigger than that; the whole file — at
    // most rawPhotoMB — is read for it then.
    if (!d && sniffed.mime === 'image/jpeg' && src.size > 256 * 1024) d = imageDims(new Uint8Array(fs.readFileSync(src.path)))
  }
  if (!d && src.width && src.height) d = { width: src.width, height: src.height }
  if (!d) d = await deps.imageInfo(src.path).catch(() => null)
  if (!d) throw new MediaError('unreadable')
  if (d.width * d.height > MAX_PHOTO_MP * 1e6) throw new MediaError('photo-too-big')
  const main = await encodeMain(src.path, d, limits, deps)
  let poster = null
  try { poster = await deps.encodeImage(src.path, d, POSTER_EDGE, 0.8, deps) } catch { poster = null }
  return { kind: 'image', main: { ...main, temp: true }, poster: poster && POSTER_MIMES.has(poster.mime) ? { ...poster, temp: true } : null }
}

/* ---------------------------------------------------------------- GIFs */

async function gif(src, limits, deps) {
  if (src.size > limits.gifMB * MB) throw new MediaError('too-large', { mb: limits.gifMB })
  const bytes = new Uint8Array(deps.fs().readFileSync(src.path))
  const info = inspectGif(bytes)
  if (!info) throw new MediaError('unreadable')
  if (info.frames === 1) return photo(src, { mime: 'image/gif', kind: 'gif' }, limits, deps)
  // The same pixel guard as a photo's, on the logical screen.
  if (info.width * info.height > MAX_PHOTO_MP * 1e6) throw new MediaError('photo-too-big')
  let clean
  try { clean = cleanGif(bytes) } catch { throw new MediaError('unreadable') }
  const main = { data: toBuffer(clean), mime: 'image/gif', width: info.width, height: info.height, size: clean.byteLength }
  let poster = null
  try { poster = await deps.encodeImage(src.path, info, POSTER_EDGE, 0.8, deps) } catch { poster = null }
  return { kind: 'gif', main, poster: poster && POSTER_MIMES.has(poster.mime) ? { ...poster, temp: true } : null, dur: round1(info.durMs / 1000) }
}

/* ---------------------------------------------------------------- videos */

async function video(src, sniffed, limits, deps) {
  if (src.size > limits.videoMB * MB) throw new MediaError('too-large', { mb: limits.videoMB })
  const fs = deps.fs()
  let bytes = new Uint8Array(fs.readFileSync(src.path))
  let info = null
  let mime = sniffed.mime
  if (mime === 'video/webm') {
    info = inspectWebm(bytes)
    if (!info) throw new MediaError('unreadable')
  } else {
    info = inspectMp4(bytes)
    if (!info) throw new MediaError('unreadable')
    // The same rule as the server: a length it says is checked, an unknown one passes.
    if (info.durationSec != null && info.durationSec > limits.videoSec + 1) throw new MediaError('too-long', { sec: limits.videoSec })
    try { bytes = scrubMp4(bytes) } catch { throw new MediaError('unreadable') }
    mime = info.brand === 'qt  ' ? 'video/quicktime' : 'video/mp4'
  }
  const reported = typeof src.duration === 'number' && Number.isFinite(src.duration) && src.duration > 0 ? src.duration : null
  const dur = info.durationSec > 0 ? info.durationSec : reported
  if (dur != null && dur > limits.videoSec + 1) throw new MediaError('too-long', { sec: limits.videoSec })
  const width = info.width || src.width || 0
  const height = info.height || src.height || 0
  if (!width || !height) throw new MediaError('unreadable')
  let poster = null
  if (src.thumb) {
    try {
      const size = fileSize(fs, src.thumb)
      const head = readHead(src.thumb, 256 * 1024, { fs, size })
      const s = sniffKind(head)
      const d = imageDims(head) || await deps.imageInfo(src.thumb).catch(() => null)
      if (s && POSTER_MIMES.has(s.mime) && d) poster = { path: src.thumb, mime: s.mime, width: d.width, height: d.height, size: size || 0 }
    } catch { poster = null }
  }
  const codec = info.codec || 'other'
  const warn = mime === 'video/webm' || codec !== 'avc1'
  return {
    kind: 'video',
    main: { data: toBuffer(bytes), mime, width, height, size: bytes.byteLength },
    poster,
    dur: dur != null ? round1(dur) : null,
    codec,
    warnings: warn ? [WARN_CODEC] : []
  }
}

const toBuffer = u8 => (u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength ? u8.buffer : u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength))

/* ---------------------------------------------------------------- the whole ingest */

const DEFAULT_DEPS = { fs: wxFs, compressImage: wxCompress, imageInfo: wxImageInfo, encodeImage }

/**
 * A picked file (a wx.chooseMedia tempFiles entry, or a path) → { media, files, blobs, warnings }.
 * `media` passes normalizeMediaRef; `files` (alias `blobs`) go into the store with storeIngested.
 * Throws MediaError. `deps` swaps the wx parts (fs, compressImage, imageInfo, encodeImage).
 */
export async function ingestMediaFile(input, limits = DEFAULT_LIMITS, deps = {}) {
  const d = { ...DEFAULT_DEPS, ...deps }
  const lim = { ...DEFAULT_LIMITS, ...limits }
  const fs = d.fs()
  const path = typeof input === 'string' ? input : input && input.tempFilePath
  if (!path) throw new MediaError('unreadable')
  let size = typeof input === 'object' && typeof input.size === 'number' ? input.size : null
  const real = fileSize(fs, path)
  if (real != null) size = real
  if (size == null) throw new MediaError('unreadable')
  const src = {
    path, size,
    width: input?.width || 0, height: input?.height || 0,
    duration: input?.duration, thumb: input?.thumbTempFilePath || null
  }
  let head
  try { head = readHead(path, 64, { fs, size }) } catch { throw new MediaError('unreadable') }
  const sniffed = sniffKind(head)
  if (!sniffed) throw new MediaError('type')
  const out = sniffed.kind === 'video' ? await video(src, sniffed, lim, d)
    : sniffed.kind === 'gif' ? await gif(src, lim, d)
    : await photo(src, sniffed, lim, d)
  const files = []
  const withHash = async part => {
    const hash = part.path ? sha256OfFile(part.path, { fs, size: part.size || undefined }) : await sha256Hex(part.data)
    if (!files.some(b => b.hash === hash)) {
      const f = { hash, mime: part.mime, size: part.size }
      if (part.path) f.path = part.path; else f.data = part.data
      if (part.temp) f.temp = true
      files.push(f)
    }
    return hash
  }
  const ref = {
    kind: out.kind,
    hash: await withHash(out.main),
    mime: out.main.mime,
    size: out.main.size,
    width: out.main.width,
    height: out.main.height,
    at: Date.now()
  }
  if (out.dur != null) ref.dur = out.dur
  if (out.codec) ref.codec = out.codec
  if (out.poster) {
    ref.poster = { hash: await withHash(out.poster), mime: out.poster.mime, size: out.poster.size, width: out.poster.width, height: out.poster.height }
  }
  const media = normalizeMediaRef(ref)
  if (!media) throw new MediaError('unreadable')
  return { media, files, blobs: files, warnings: out.warnings || [] }
}

/**
 * Puts what ingestMediaFile made into the store (as pending, like every new file), then deletes
 * the temporary files it wrote. Resolves the MediaRef.
 */
export async function storeIngested(out, { media = mediaStore, fs = wxFs } = {}) {
  for (const f of out.files) {
    if (f.path) await media.putFile(f.hash, f.path, { mime: f.mime, size: f.size, pending: true })
    else await media.put(f.hash, f.data, { mime: f.mime, pending: true })
  }
  for (const f of out.files) {
    if (f.temp && f.path) { try { fs().unlinkSync(f.path) } catch { /* the system clears temp files */ } }
  }
  return out.media
}
