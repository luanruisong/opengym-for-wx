/* The one local store for the photos, GIFs and videos the user takes: custom exercises' pictures,
 * workout photos and progress photos.
 *
 * MINI PROGRAM PORT. Differences from the web app's store:
 *  - Bytes are ArrayBuffers (or Uint8Arrays), never Blobs: put(hash, data, { mime, pending }),
 *    and get(hash) resolves { data: ArrayBuffer, path, mime, size, pending, rejected }.
 *  - putFile(hash, filePath, { mime, size, pending }) keeps a file that is already on disk (a temp
 *    file from wx.chooseMedia, a scrubbed video written by media-ingest) by copying it, so a 40 MB
 *    video never has to pass through JS memory.
 *  - url(hash) resolves a local file path (`${wx.env.USER_DATA_PATH}/opengym-media/<hash>.<ext>`),
 *    usable as-is as <image src> / <video src>; release(hash) is kept for the callers' shape but
 *    there is nothing to revoke. pathNow(hash) is the same path synchronously (null when the file
 *    is not here or the index has not loaded yet) — what mapState wants.
 *  - Backends: the wx file system (media-store-fs.js, the app's store) and memory (the tests;
 *    also the fallback when the folder cannot be made, with `persistent: false`). IndexedDB and
 *    the Capacitor branches are gone. A memory backend has no file path: its url() answers null
 *    unless the store was made with an `objectURL` stand-in ({ createObjectURL({ data, type }),
 *    revokeObjectURL(url) }), which only the tests pass.
 *  - `pending` / `rejected` are kept on the records (backups and the record shape read them), but
 *    with no server nothing ever uploads them.
 *
 * A record is { hash, mime, size, putAt, shownAt, pending, rejected }:
 *   pending   the server has not confirmed it holds the file (picked here, or imported)
 *   rejected  the server refused it for good
 *   shownAt   when it was last displayed, written at most once an hour — what eviction reads
 */
import { MEDIA_MIMES } from './media-refs.js'
import { fsBackend } from './media-store-fs.js'

const HOUR = 3600000

const byteLen = d => (d == null ? 0 : typeof d.byteLength === 'number' ? d.byteLength : 0)
const toBuffer = d => {
  if (d instanceof ArrayBuffer) return d
  if (d && ArrayBuffer.isView(d)) return d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength)
  throw new TypeError('media-store: data must be an ArrayBuffer or a typed array')
}

/** A backend that forgets everything with the page — the tests', and the fallback's. */
export function memoryBackend({ fs = () => wx.getFileSystemManager() } = {}) {
  const recs = new Map()
  const blobs = new Map()
  return {
    name: 'memory',
    persistent: false,
    async open() { return true },
    async all() { return [...recs.values()].map(r => ({ ...r })) },
    async getBlob(hash) { return blobs.get(hash) || null },
    async put(rec, data) { recs.set(rec.hash, { ...rec }); if (data) blobs.set(rec.hash, toBuffer(data)) },
    async putFile(rec, path) { const d = fs().readFileSync(path); recs.set(rec.hash, { ...rec, size: d.byteLength }); blobs.set(rec.hash, d); return d.byteLength },
    async patch(hash, fields) { const r = recs.get(hash); if (r) recs.set(hash, { ...r, ...fields }) },
    async remove(hash) { recs.delete(hash); blobs.delete(hash) },
    async clear() { recs.clear(); blobs.clear() }
  }
}

// The type a <video> can play a file as. A MOV is an MP4 in all that matters to a player; the fs
// backend stores it with a .mp4 extension for the same reason (MEDIA_MIMES playExt).
export function playType(mime, canPlayType = defaultCanPlay) {
  if (mime !== 'video/quicktime') return mime
  return canPlayType('video/quicktime') ? mime : 'video/mp4'
}
function defaultCanPlay(type) { return '' }

export function createMediaStore(backend, {
  fallback = memoryBackend,
  now = () => Date.now(),
  objectURL = null,
  revokeDelayMs = 30000,
  canPlayType = defaultCanPlay
} = {}) {
  let be = backend
  let opening = null
  let persistent = !!backend.persistent
  const index = new Map()
  const listeners = new Set()
  // hash → { url, refs, timer, file }  (file: a phone's file URL, which is never revoked)
  const urls = new Map()
  const making = new Map()   // hash → the url() in progress, so two callers make one
  const held = new Map()     // hash → how many open editors hold it as their draft (hold)

  // A second put of the same hash: only the record changes. True when there was one.
  const updateExisting = (hash, pending) => {
    const cur = index.get(hash)
    if (!cur) return false
    index.set(hash, { ...cur, pending: !!pending, rejected: pending ? !!cur.rejected : false, putAt: now() })
    return true
  }
  const pick = r => ({ pending: r.pending, rejected: r.rejected, putAt: r.putAt })

  const emit = () => { for (const fn of listeners) { try { fn() } catch { /* a listener's own problem */ } } }

  const ready = () => {
    if (!opening) {
      opening = (async () => {
        let ok = false
        try { ok = await be.open() } catch { ok = false }
        if (!ok) { be = fallback(); persistent = false; await be.open() }
        else persistent = !!be.persistent
        try { for (const r of await be.all()) index.set(r.hash, r) } catch { /* an empty index then */ }
        emit()
      })()
    }
    return opening
  }

  const revokeNow = hash => {
    const u = urls.get(hash)
    if (!u) return
    clearTimeout(u.timer)
    urls.delete(hash)
    if (!u.file && objectURL) { try { objectURL.revokeObjectURL(u.url) } catch { /* already gone */ } }
  }

  const store = {
    ready,
    /** Marks files as a draft's (an editor that is open) until the returned function is called.
     *  The local clean-up keeps what is held however long ago it was put: its one-hour grace is
     *  for a draft abandoned, not for one still being written. In memory only — a draft does not
     *  outlive its tab. */
    hold(hashes) {
      const hs = [...new Set(hashes)].filter(Boolean)
      for (const h of hs) held.set(h, (held.get(h) || 0) + 1)
      let done = false
      return () => {
        if (done) return
        done = true
        for (const h of hs) { const n = (held.get(h) || 0) - 1; if (n > 0) held.set(h, n); else held.delete(h) }
      }
    },
    isHeld: hash => held.has(hash),
    get persistent() { return persistent },
    get backendName() { return be.name },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },

    async has(hash) { await ready(); return index.has(hash) },
    /** The record with its bytes (ArrayBuffer) and, on the fs backend, its file path; or null. */
    async get(hash) {
      await ready()
      const r = index.get(hash)
      if (!r) return null
      const data = await be.getBlob(hash).catch(() => null)
      if (!data) return null
      const path = typeof be.filePath === 'function' ? be.filePath(hash) : null
      return { data, path, mime: r.mime, size: r.size, pending: !!r.pending, rejected: !!r.rejected }
    },
    /** Keeps `data` (ArrayBuffer / Uint8Array) under `hash`. The same hash is the same bytes, so a
     *  second put only updates the record — `pending` as the caller says. */
    async put(hash, data, { mime, pending = true } = {}) {
      if (!MEDIA_MIMES[mime]) throw new Error('media-store: not a media type: ' + mime)
      await ready()
      if (!updateExisting(hash, pending)) {
        const rec = { hash, mime, size: byteLen(data), putAt: now(), shownAt: 0, pending: !!pending, rejected: false }
        await be.put(rec, data)
        index.set(hash, rec)
      } else await be.patch(hash, pick(index.get(hash)))
      emit()
    },
    /** Keeps the file at `path` (e.g. a wx.chooseMedia temp file) under `hash`, by copying it.
     *  The caller has hashed it (media-ingest does); `size` is taken from the file when omitted. */
    async putFile(hash, path, { mime, size, pending = true } = {}) {
      if (!MEDIA_MIMES[mime]) throw new Error('media-store: not a media type: ' + mime)
      await ready()
      if (!updateExisting(hash, pending)) {
        const rec = { hash, mime, size: typeof size === 'number' ? size : 0, putAt: now(), shownAt: 0, pending: !!pending, rejected: false }
        const written = await be.putFile(rec, path)
        if (typeof written === 'number') rec.size = written
        index.set(hash, rec)
      } else await be.patch(hash, pick(index.get(hash)))
      emit()
    },
    /** The file path to show `hash` by, now, or null (not here, index not loaded, memory backend). */
    pathNow(hash) {
      if (!index.has(hash) || typeof be.filePath !== 'function') return null
      return be.filePath(hash)
    },
    /** A URL to show the file by, or null when it is not here. Release it when done. */
    async url(hash) {
      await ready()
      const have = urls.get(hash)
      if (have) { have.refs++; clearTimeout(have.timer); have.timer = null; return have.url }
      if (making.has(hash)) {
        const u = await making.get(hash)
        if (u) { const e = urls.get(hash); if (e) { e.refs++; clearTimeout(e.timer); e.timer = null } }
        return u
      }
      const r = index.get(hash)
      if (!r) return null
      const job = (async () => {
        let url = null, file = false
        if (typeof be.fileUrl === 'function') { url = await be.fileUrl(hash, r).catch(() => null); file = !!url }
        if (!url) {
          if (!objectURL) return null
          const data = await be.getBlob(hash).catch(() => null)
          if (!data) return null
          url = objectURL.createObjectURL({ data, type: playType(r.mime, canPlayType) })
        }
        urls.set(hash, { url, refs: 0, timer: null, file })
        return url
      })()
      making.set(hash, job)
      let url
      try { url = await job } finally { making.delete(hash) }
      const entry = url && urls.get(hash)
      if (!entry) return null   // not here, or removed while the URL was being made
      entry.refs++
      // When it was last shown decides what goes first when the cache is full; an hour is
      // precise enough, and a write per display would be one per scroll.
      if (!t0(r.shownAt) || t0(r.shownAt) + HOUR <= now()) {
        r.shownAt = now()
        be.patch(hash, { shownAt: r.shownAt }).catch(() => {})
      }
      return url
    },
    release(hash) {
      const u = urls.get(hash)
      if (!u) return
      u.refs = Math.max(0, u.refs - 1)
      if (u.refs || u.timer) return
      u.timer = setTimeout(() => { const cur = urls.get(hash); if (cur && !cur.refs) revokeNow(hash) }, revokeDelayMs)
    },
    async markSynced(hash) {
      await ready()
      const r = index.get(hash)
      if (!r || (!r.pending && !r.rejected)) return
      Object.assign(r, { pending: false, rejected: false })
      await be.patch(hash, { pending: false, rejected: false })
      emit()
    },
    async markRejected(hash) {
      await ready()
      const r = index.get(hash)
      if (!r || r.rejected) return
      r.rejected = true
      await be.patch(hash, { rejected: true })
      emit()
    },
    async remove(hash) {
      await ready()
      if (!index.has(hash)) return
      revokeNow(hash)
      index.delete(hash)
      await be.remove(hash).catch(() => {})
      emit()
    },
    /** Deletes every record not in `keep`, except those put at or after `keepPutAfter` — a file
     *  picked meanwhile in an editor that is still open, or by another tab. */
    async retainOnly(keep, { keepPutAfter = now() } = {}) {
      await ready()
      let removed = 0
      for (const [hash, r] of [...index]) {
        if (keep.has(hash) || (r.putAt || 0) >= keepPutAfter) continue
        revokeNow(hash)
        index.delete(hash)
        await be.remove(hash).catch(() => {})
        removed++
      }
      if (removed) emit()
      return removed
    },
    async clearAll() {
      await ready()
      for (const hash of [...urls.keys()]) revokeNow(hash)
      index.clear()
      await be.clear().catch(() => {})
      emit()
    },
    async list() { await ready(); return [...index.values()].map(r => ({ ...r })) },
    async usage() {
      await ready()
      let bytes = 0
      for (const r of index.values()) bytes += r.size || 0
      return { bytes, count: index.size }
    },
    async pendingHashes() { await ready(); return store.pendingNow() },
    /** The pending hashes as the index holds them right now — empty before it has loaded. For
     *  the sign-out check (lib/media-owed.js), which cannot wait. */
    pendingNow() { return new Set([...index.values()].filter(r => r.pending).map(r => r.hash)) },
    /** The rejected hashes, for Settings to say what the server would not take. */
    rejectedNow() { return new Set([...index.values()].filter(r => r.rejected).map(r => r.hash)) }
  }
  return store
}
const t0 = v => (typeof v === 'number' ? v : 0)

let shared = null
/** The app's store: files under wx.env.USER_DATA_PATH. Made on first use, so importing this
 *  module touches no wx API. */
export function getMediaStore() {
  if (!shared) shared = createMediaStore(fsBackend())
  return shared
}
/** Whether anything in this session has used the store (the sync at start, the editor, a
 *  thumbnail) and so made and opened it. */
export const mediaStoreInUse = () => shared !== null
/** Tests only: swap the shared store (null makes a fresh one on next use). */
export function _setMediaStore(s) { shared = s }

/** The shared store under the name the rest of the app uses. A thin forwarder (plain methods, no
 *  Proxy), so that importing it is free and a test can swap what it forwards to (_setMediaStore). */
const METHODS = ['ready', 'hold', 'isHeld', 'subscribe', 'has', 'get', 'put', 'putFile', 'pathNow', 'url', 'release',
  'markSynced', 'markRejected', 'remove', 'retainOnly', 'clearAll', 'list', 'usage', 'pendingHashes', 'pendingNow', 'rejectedNow']
export const mediaStore = {}
for (const k of METHODS) mediaStore[k] = (...args) => { const s = getMediaStore(); return s[k](...args) }
Object.defineProperty(mediaStore, 'persistent', { get: () => getMediaStore().persistent, enumerable: true })
Object.defineProperty(mediaStore, 'backendName', { get: () => getMediaStore().backendName, enumerable: true })
