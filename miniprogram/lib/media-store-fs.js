/* The mini program's backend for lib/media-store.js: plain files in the user data folder.
 *
 *   ${wx.env.USER_DATA_PATH}/opengym-media/<hash>.<playExt>   one file per photo, GIF or video
 *   ${wx.env.USER_DATA_PATH}/opengym-media/index.json          { hash: { mime, size, putAt, shownAt, pending, rejected } }
 *
 * (Ported from the Capacitor backend; the layout and the crash safety are the same.) Files are
 * shown by their path: an <image>/<video> takes a USER_DATA_PATH path as its src. A MOV is
 * stored as .mp4 (MEDIA_MIMES playExt), which is what a player expects of those bytes.
 *
 * Crash safety: a file is written to <name>.part and renamed once complete, and the index is
 * written after the files it lists (1 s debounce, flushed when the mini program goes to the
 * background — wx.onAppHide). At start the two are reconciled: an index entry without its file is
 * dropped, and a file without an entry is checked against its name's sha256 and kept as pending.
 *
 * Every wx call is made inside a function (open() first), so the module imports in Node; the
 * file system manager and the root folder can be injected for the tests.
 */
import { MEDIA_MIMES } from './media-refs.js'
import { sniffKind } from './media-sniff.js'
import { createSha256 } from './sha256.js'

const DIR = 'opengym-media'
const INDEX_NAME = 'index.json'
const CHUNK = 4 * 1024 * 1024
const FILE_RE = /^([0-9a-f]{64})\.(jpg|png|webp|gif|mp4|webm)$/

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
/** Uint8Array → base64 (btoa does not exist in the mini program). */
export function toBase64(u8) {
  let s = ''
  const n = u8.length
  let i = 0
  for (; i + 2 < n; i += 3) {
    const v = (u8[i] << 16) | (u8[i + 1] << 8) | u8[i + 2]
    s += B64[v >> 18] + B64[(v >> 12) & 63] + B64[(v >> 6) & 63] + B64[v & 63]
  }
  if (i < n) {
    const v = (u8[i] << 16) | ((i + 1 < n ? u8[i + 1] : 0) << 8)
    s += B64[v >> 18] + B64[(v >> 12) & 63] + (i + 1 < n ? B64[(v >> 6) & 63] : '=') + '='
  }
  return s
}

const fileName = (hash, mime) => hash + '.' + (MEDIA_MIMES[mime]?.playExt || 'bin')

const toBuffer = d => {
  if (d instanceof ArrayBuffer) return d
  if (d && ArrayBuffer.isView(d)) return d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength)
  throw new TypeError('media-store-fs: data must be an ArrayBuffer or a typed array')
}

/** Reads `length` bytes at `position` of a file (whole file when the base library has no ranged
 *  read), as a Uint8Array. */
function readRange(fs, path, position, length) {
  try {
    const b = fs.readFileSync(path, undefined, position, length)
    if (b && b.byteLength <= length) return new Uint8Array(b)
  } catch { /* an older base library: the whole file below (a missing file throws there) */ }
  return new Uint8Array(fs.readFileSync(path)).subarray(position, position + length)
}

/** The size of the file at `path` in bytes (statSync), or null. */
export function fileSize(fs, path) {
  try { const st = fs.statSync(path); return st && typeof st.size === 'number' ? st.size : null } catch { return null }
}

/** sha256 hex of a file on disk, read in 4 MB pieces, so a video is never one more big buffer. */
export function sha256OfFile(path, { fs = wx.getFileSystemManager(), size = fileSize(fs, path) } = {}) {
  const h = createSha256()
  if (size == null) { h.update(new Uint8Array(fs.readFileSync(path))); return h.hex() }
  for (let o = 0; o < size; o += CHUNK) h.update(readRange(fs, path, o, Math.min(CHUNK, size - o)))
  return h.hex()
}

/** The first `n` bytes of a file. */
export function readHead(path, n = 64, { fs = wx.getFileSystemManager(), size = fileSize(fs, path) } = {}) {
  return readRange(fs, path, 0, size == null ? n : Math.min(n, size))
}

export function fsBackend({
  fs = () => wx.getFileSystemManager(),
  root = () => wx.env.USER_DATA_PATH,
  onHide = fn => { if (typeof wx !== 'undefined' && typeof wx.onAppHide === 'function') wx.onAppHide(fn) },
  now = () => Date.now(),
  debounceMs = 1000
} = {}) {
  let FS = null
  let base = ''
  let recs = {}
  let writeTm = null

  const pathOf = name => base + '/' + name
  const indexPath = () => base + '/' + INDEX_NAME
  const saveIndex = () => {
    try { FS.writeFileSync(indexPath(), JSON.stringify(recs), 'utf8') } catch { /* next change writes it again */ }
  }
  const scheduleIndex = () => {
    clearTimeout(writeTm)
    writeTm = setTimeout(() => { writeTm = null; saveIndex() }, debounceMs)
  }
  const flush = () => { if (writeTm) { clearTimeout(writeTm); writeTm = null; saveIndex() } }
  const unlink = p => { try { FS.unlinkSync(p) } catch { /* not there */ } }
  const replaceWith = (part, name) => {
    unlink(pathOf(name))
    FS.renameSync(part, pathOf(name))
  }

  return {
    name: 'fs',
    persistent: true,
    flush,
    async open() {
      try {
        FS = fs()
        base = root() + '/' + DIR
      } catch { return false }
      if (!FS) return false
      try { FS.mkdirSync(base, true) } catch (e) {
        // Already there is fine; anything else (no USER_DATA_PATH) means no folder to keep files in.
        try { FS.accessSync(base) } catch { return false }
      }
      try {
        const parsed = JSON.parse(FS.readFileSync(indexPath(), 'utf8'))
        recs = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
      } catch { recs = {} }
      let names = []
      try { names = (FS.readdirSync(base) || []).filter(n => typeof n === 'string') } catch { names = [] }
      const present = new Set(names)
      let changed = false
      // Entries whose file is gone: the file was never renamed into place, or was deleted.
      for (const [h, r] of Object.entries(recs)) {
        if (!r || !MEDIA_MIMES[r.mime] || !present.has(fileName(h, r.mime))) { delete recs[h]; changed = true }
      }
      for (const name of names) {
        if (name === INDEX_NAME) continue
        if (name.endsWith('.part')) { unlink(pathOf(name)); continue }
        const m = FILE_RE.exec(name)
        if (!m || recs[m[1]]) continue
        // A file the index never got to list (the app died within the debounce). Its name is
        // its hash; one whose bytes do not match is half a write and goes.
        try {
          const p = pathOf(name)
          const size = fileSize(FS, p)
          const sniffed = sniffKind(readHead(p, 64, { fs: FS, size }))
          if (sha256OfFile(p, { fs: FS, size }) !== m[1] || !sniffed || !MEDIA_MIMES[sniffed.mime]) throw new Error('mismatch')
          recs[m[1]] = { hash: m[1], mime: sniffed.mime, size: size || 0, putAt: now(), shownAt: 0, pending: true, rejected: false }
          changed = true
        } catch {
          unlink(pathOf(name))
        }
      }
      if (changed) saveIndex()
      try { onHide(flush) } catch { /* flushed by the debounce then */ }
      return true
    },
    async all() { return Object.entries(recs).map(([h, r]) => ({ ...r, hash: h })) },
    /** The bytes of a file, as an ArrayBuffer. */
    async getBlob(h) {
      const r = recs[h]
      if (!r) return null
      try { return FS.readFileSync(pathOf(fileName(h, r.mime))) } catch { return null }
    },
    async put(rec, data) {
      const name = fileName(rec.hash, rec.mime)
      const part = pathOf(name + '.part')
      FS.writeFileSync(part, toBuffer(data))
      replaceWith(part, name)
      recs[rec.hash] = { ...rec }
      scheduleIndex()
    },
    /** Copies the file at `src` in; resolves its size. */
    async putFile(rec, src) {
      const name = fileName(rec.hash, rec.mime)
      const part = pathOf(name + '.part')
      FS.copyFileSync(src, part)
      replaceWith(part, name)
      const size = fileSize(FS, pathOf(name))
      recs[rec.hash] = { ...rec, size: size == null ? rec.size : size }
      scheduleIndex()
      return recs[rec.hash].size
    },
    async patch(h, fields) {
      if (!recs[h]) return
      recs[h] = { ...recs[h], ...fields }
      scheduleIndex()
    },
    async remove(h) {
      const r = recs[h]
      if (!r) return
      delete recs[h]
      // The file first: a crash in between leaves an index entry without its file, which the
      // next start drops.
      unlink(pathOf(fileName(h, r.mime)))
      scheduleIndex()
    },
    async clear() {
      clearTimeout(writeTm)
      writeTm = null
      let names = []
      try { names = FS.readdirSync(base) || [] } catch { names = [] }
      for (const n of names) unlink(pathOf(n))
      recs = {}
      saveIndex()
    },
    /** The file's path, synchronously (null when it is not here). */
    filePath(h) {
      const r = recs[h]
      return r ? pathOf(fileName(h, r.mime)) : null
    },
    async fileUrl(h) { return this.filePath(h) }
  }
}
