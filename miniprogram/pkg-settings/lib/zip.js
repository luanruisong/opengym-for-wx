// GENERATED from lib-shared/zip.js by tools/sync-shared.mjs. Edit lib-shared/zip.js, then rerun.
/* The smallest zip this app needs: store-only (no compression).
 *
 * MINI PROGRAM: there is no Blob/File/TextEncoder. zipStore takes entries as
 * { name, data } (data: Uint8Array | ArrayBuffer | string, a string written as UTF-8; `blob` is
 * accepted as an alias of `data`) and resolves an ArrayBuffer, which the caller writes to
 * wx.env.USER_DATA_PATH. readZip / looksLikeZip take the whole file as an ArrayBuffer or
 * Uint8Array (fs.readFileSync of the picked file) and readZip's entries are
 * { name, size, bytes } with `bytes` a Uint8Array view into it (no copy). utf8Encode/utf8Decode
 * stand in for TextEncoder/TextDecoder.
 *
 * Original notes:
 * "Export with photos & videos" writes one (lib/backup-media.js), and "Import backup" reads one.
 * Photos, GIFs and videos are already compressed, so deflate would cost a dependency and buy
 * nothing; the JSON beside them is small. Nothing is ever joined into one big string or buffer:
 * the zip is a Blob made of header bytes and the original file Blobs, and reading one only slices
 * the picked File, so a backup with 150 MB of videos costs no more memory than its headers.
 *
 * What readZip refuses, and why: any compression method but "stored" (this app never writes
 * one — an archiver repacked the file), encryption, more than 2000 entries, a name with '..' or a
 * leading '/', and more than 1 GiB of entry data. zipStore uses the same entry and data limits,
 * so it cannot export a backup this app would refuse to import. ZIP64 is neither written nor read.
 */

export class ZipError extends Error {
  constructor(code, message) { super(message || code); this.code = code }
}


/** UTF-8 bytes of a string (TextEncoder does not exist in the mini program). */
export function utf8Encode(str) {
  const s = String(str)
  const out = []
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1)
      if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++ }
      else c = 0xfffd
    } else if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
  }
  return new Uint8Array(out)
}

/** The string UTF-8 `bytes` spell (invalid sequences become U+FFFD). */
export function utf8Decode(input) {
  const b = toU8(input)
  let out = ''
  const parts = []
  let i = 0
  while (i < b.length) {
    const c = b[i]
    let cp = 0xfffd, n = 1
    if (c < 0x80) cp = c
    else if (c >= 0xc2 && c < 0xe0 && i + 1 < b.length && (b[i + 1] & 0xc0) === 0x80) { cp = ((c & 31) << 6) | (b[i + 1] & 63); n = 2 }
    else if (c >= 0xe0 && c < 0xf0 && i + 2 < b.length && (b[i + 1] & 0xc0) === 0x80 && (b[i + 2] & 0xc0) === 0x80) {
      cp = ((c & 15) << 12) | ((b[i + 1] & 63) << 6) | (b[i + 2] & 63); n = 3
      if (cp < 0x800 || (cp >= 0xd800 && cp <= 0xdfff)) cp = 0xfffd
    } else if (c >= 0xf0 && c < 0xf5 && i + 3 < b.length && (b[i + 1] & 0xc0) === 0x80 && (b[i + 2] & 0xc0) === 0x80 && (b[i + 3] & 0xc0) === 0x80) {
      cp = ((c & 7) << 18) | ((b[i + 1] & 63) << 12) | ((b[i + 2] & 63) << 6) | (b[i + 3] & 63); n = 4
      if (cp < 0x10000 || cp > 0x10ffff) cp = 0xfffd
    }
    if (cp > 0xffff) { cp -= 0x10000; parts.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023)) } else parts.push(cp)
    i += n
    if (parts.length > 8192) { out += String.fromCharCode.apply(null, parts); parts.length = 0 }
  }
  return out + String.fromCharCode.apply(null, parts)
}

/** Uint8Array | ArrayBuffer | typed array view | string (as UTF-8) → Uint8Array (no copy when it can). */
export function toU8(data) {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (data && ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  if (typeof data === 'string') return utf8Encode(data)
  if (data == null) return new Uint8Array(0)
  throw new TypeError('zip: not bytes')
}

let TABLE = null
const table = () => {
  if (TABLE) return TABLE
  TABLE = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    TABLE[n] = c >>> 0
  }
  return TABLE
}

/** CRC-32 (the zip one) of a Uint8Array, continuing from `crc` for data read in pieces. */
export function crc32(bytes, crc = 0) {
  const t = table()
  let c = (crc ^ 0xffffffff) >>> 0
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}


const LIMIT_32 = 0xffffffff
export const MAX_ENTRIES = 2000
export const MAX_TOTAL = 1024 * 1024 * 1024

function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: (Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  }
}

/**
 * A store-only zip of `entries` ([{ name, data }]) as one ArrayBuffer. Names are written as UTF-8 (flag
 * bit 11), so a name any archiver shows as written. Refuses more entries or data than readZip
 * accepts, and anything needing ZIP64.
 */
export async function zipStore(entries, { now = new Date() } = {}) {
  if (entries.length > MAX_ENTRIES) throw new ZipError('too-many')
  const { time, date } = dosTime(now)
  const parts = []
  const central = []
  let offset = 0
  let total = 0
  const items = entries.map(e => ({ name: e.name, bytes: e.data !== undefined ? e.data : e.blob }))
  // Sizes first, so an export over the limit is refused before anything is converted.
  for (const it of items) {
    const n = it.bytes == null ? 0 : typeof it.bytes === 'string' ? it.bytes.length : it.bytes.byteLength
    if (n > LIMIT_32) throw new ZipError('too-large')
    total += n
    if (total > MAX_TOTAL) throw new ZipError('too-large')
  }
  total = 0
  for (const it of items) {
    const name = it.name
    const blob = toU8(it.bytes)
    const nameBytes = utf8Encode(name)
    const size = blob.byteLength
    if (size > LIMIT_32) throw new ZipError('too-large')
    total += size
    if (total > MAX_TOTAL) throw new ZipError('too-large')
    const crc = crc32(blob)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)         // version needed: 2.0
    local.setUint16(6, 0x0800, true)     // UTF-8 names
    local.setUint16(8, 0, true)          // stored
    local.setUint16(10, time, true)
    local.setUint16(12, date, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, size, true)
    local.setUint32(22, size, true)
    local.setUint16(26, nameBytes.length, true)
    local.setUint16(28, 0, true)
    parts.push(new Uint8Array(local.buffer), nameBytes, blob)
    const cd = new DataView(new ArrayBuffer(46))
    cd.setUint32(0, 0x02014b50, true)
    cd.setUint16(4, 20, true)
    cd.setUint16(6, 20, true)
    cd.setUint16(8, 0x0800, true)
    cd.setUint16(10, 0, true)
    cd.setUint16(12, time, true)
    cd.setUint16(14, date, true)
    cd.setUint32(16, crc, true)
    cd.setUint32(20, size, true)
    cd.setUint32(24, size, true)
    cd.setUint16(28, nameBytes.length, true)
    cd.setUint32(42, offset, true)       // the rest (extra, comment, disk, attributes) stays 0
    central.push(new Uint8Array(cd.buffer), nameBytes)
    offset += 30 + nameBytes.length + size
    if (offset > LIMIT_32) throw new ZipError('too-large')
  }
  const cdSize = central.reduce((n, p) => n + p.byteLength, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, cdSize, true)
  end.setUint32(16, offset, true)
  const all = [...parts, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((n, p) => n + p.byteLength, 0))
  let at = 0
  for (const p of all) { out.set(p, at); at += p.byteLength }
  return out.buffer
}

const EOCD_SEARCH = 65557   // 22-byte record + the largest possible comment

const readBytes = (file, start, end) => file.subarray(Math.min(start, file.length), Math.min(end, file.length))

/** Whether a file starts like a zip (PK\x03\x04). */
export async function looksLikeZip(input) {
  const b = readBytes(toU8(input), 0, 4)
  return b.length === 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04
}

/**
 * The entries of a store-only zip as [{ name, size, bytes }], each `bytes` a view into the file
 * (an ArrayBuffer or Uint8Array) — nothing is copied. Throws ZipError with code 'not-zip',
 * 'compressed' (repacked by an archiver), 'encrypted', 'too-many', 'bad-name' or 'too-large'.
 */
export async function readZip(input) {
  const file = toU8(input)
  const size = file.length
  const tailStart = Math.max(0, size - EOCD_SEARCH)
  const tail = readBytes(file, tailStart, size)
  let eocd = -1
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) { eocd = i; break }
  }
  if (eocd < 0) throw new ZipError('not-zip')
  const e = new DataView(tail.buffer, tail.byteOffset + eocd, 22)
  const count = e.getUint16(10, true)
  const cdSize = e.getUint32(12, true)
  const cdOffset = e.getUint32(16, true)
  if (count === 0xffff || cdOffset === LIMIT_32) throw new ZipError('too-large')   // ZIP64
  if (count > MAX_ENTRIES) throw new ZipError('too-many')
  if (cdOffset + cdSize > size) throw new ZipError('not-zip')
  const cd = readBytes(file, cdOffset, cdOffset + cdSize)
  const dv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength)
  const out = []
  let total = 0
  let p = 0
  for (let n = 0; n < count; n++) {
    if (p + 46 > cd.length || dv.getUint32(p, true) !== 0x02014b50) throw new ZipError('not-zip')
    const flags = dv.getUint16(p + 8, true)
    const method = dv.getUint16(p + 10, true)
    const csize = dv.getUint32(p + 20, true)
    const usize = dv.getUint32(p + 24, true)
    const nameLen = dv.getUint16(p + 28, true)
    const extraLen = dv.getUint16(p + 30, true)
    const commentLen = dv.getUint16(p + 32, true)
    const localOffset = dv.getUint32(p + 42, true)
    if (p + 46 + nameLen > cd.length) throw new ZipError('not-zip')
    const name = utf8Decode(cd.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen
    if (flags & 1) throw new ZipError('encrypted')
    if (method !== 0) throw new ZipError('compressed')
    if (csize !== usize) throw new ZipError('compressed')
    if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) throw new ZipError('bad-name')
    total += usize
    if (total > MAX_TOTAL) throw new ZipError('too-large')
    if (name.endsWith('/')) continue   // a folder entry holds nothing
    const lh = readBytes(file, localOffset, localOffset + 30)
    const lv = new DataView(lh.buffer, lh.byteOffset, lh.byteLength)
    if (lh.length < 30 || lv.getUint32(0, true) !== 0x04034b50) throw new ZipError('not-zip')
    const start = localOffset + 30 + lv.getUint16(26, true) + lv.getUint16(28, true)
    if (start + usize > size) throw new ZipError('not-zip')
    out.push({ name, size: usize, bytes: file.subarray(start, start + usize) })
  }
  return out
}
