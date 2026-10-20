// Patches for the newer built-ins the ported web code uses (frontend/src/lib, store). The mini
// program runs on JavaScriptCore (iOS, as old as the user's iOS) and V8 / older engines on
// Android and the devtools, so anything past ES2019 may be missing. Each patch is applied only
// when the built-in is absent. Syntax (?.  ??  ??=  class fields) is not patchable here: the
// devtools' "enhance compile" (project.config.json) transpiles it.
//
// Found in use (grep of frontend/src/lib + store, 2026-10): Object.hasOwn, Array#at, findLast,
// findLastIndex, structuredClone, String#replaceAll, Object.fromEntries, Array#flat / flatMap,
// Promise.allSettled / any, String#trimStart / trimEnd, TextEncoder / TextDecoder (zip, FIT
// export), btoa / atob, globalThis.

/* eslint-disable no-extend-native */
const G = (function () {
  if (typeof globalThis !== 'undefined') return globalThis
  if (typeof global !== 'undefined') return global // eslint-disable-line no-undef
  try { return Function('return this')() } catch (e) { return {} }
})()

function def(obj, name, fn) {
  if (!obj || typeof obj[name] === 'function') return
  try {
    Object.defineProperty(obj, name, { value: fn, configurable: true, writable: true, enumerable: false })
  } catch (e) {
    try { obj[name] = fn } catch (e2) { /* frozen */ }
  }
}

if (typeof G.globalThis === 'undefined') {
  try { G.globalThis = G } catch (e) { /* read-only */ }
}

/* ---------- Object ---------- */
def(Object, 'hasOwn', function (o, k) {
  if (o == null) throw new TypeError('Cannot convert undefined or null to object')
  return Object.prototype.hasOwnProperty.call(Object(o), k)
})

def(Object, 'fromEntries', function (iter) {
  const out = {}
  for (const pair of iter) out[pair[0]] = pair[1]
  return out
})

/* ---------- Array ---------- */
const relIndex = (len, i) => {
  i = Math.trunc(Number(i)) || 0
  return i < 0 ? len + i : i
}

def(Array.prototype, 'at', function (i) {
  const k = relIndex(this.length, i)
  return k < 0 || k >= this.length ? undefined : this[k]
})
def(String.prototype, 'at', function (i) {
  const s = String(this)
  const k = relIndex(s.length, i)
  return k < 0 || k >= s.length ? undefined : s.charAt(k)
})

def(Array.prototype, 'findLast', function (fn, thisArg) {
  for (let i = this.length - 1; i >= 0; i--) if (fn.call(thisArg, this[i], i, this)) return this[i]
  return undefined
})
def(Array.prototype, 'findLastIndex', function (fn, thisArg) {
  for (let i = this.length - 1; i >= 0; i--) if (fn.call(thisArg, this[i], i, this)) return i
  return -1
})

function flatten(arr, depth, out) {
  for (let i = 0; i < arr.length; i++) {
    if (!(i in arr)) continue
    const v = arr[i]
    if (depth > 0 && Array.isArray(v)) flatten(v, depth - 1, out)
    else out.push(v)
  }
  return out
}
def(Array.prototype, 'flat', function (depth) {
  return flatten(this, depth === undefined ? 1 : Math.trunc(Number(depth)) || 0, [])
})
def(Array.prototype, 'flatMap', function (fn, thisArg) {
  const out = []
  for (let i = 0; i < this.length; i++) {
    if (!(i in this)) continue
    const v = fn.call(thisArg, this[i], i, this)
    if (Array.isArray(v)) for (let j = 0; j < v.length; j++) out.push(v[j])
    else out.push(v)
  }
  return out
})

// ES2023 copies: not used today, cheap to have.
def(Array.prototype, 'toSorted', function (cmp) { return this.slice().sort(cmp) })
def(Array.prototype, 'toReversed', function () { return this.slice().reverse() })

/* ---------- String ---------- */
def(String.prototype, 'replaceAll', function (search, replacement) {
  if (search instanceof RegExp) {
    if (!search.global) throw new TypeError('replaceAll must be called with a global RegExp')
    return this.replace(search, replacement)
  }
  const s = String(search)
  const esc = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return this.replace(new RegExp(esc, 'g'), typeof replacement === 'function' ? replacement : String(replacement).replace(/\$/g, '$$$$'))
})
def(String.prototype, 'trimStart', function () { return String(this).replace(/^[\s﻿\xA0]+/, '') })
def(String.prototype, 'trimEnd', function () { return String(this).replace(/[\s﻿\xA0]+$/, '') })
def(String.prototype, 'padStart', function (len, fill) {
  let s = String(this); fill = fill === undefined ? ' ' : String(fill)
  if (s.length >= len || !fill) return s
  let pad = ''
  while (pad.length < len - s.length) pad += fill
  return pad.slice(0, len - s.length) + s
})
def(String.prototype, 'padEnd', function (len, fill) {
  let s = String(this); fill = fill === undefined ? ' ' : String(fill)
  if (s.length >= len || !fill) return s
  let pad = ''
  while (pad.length < len - s.length) pad += fill
  return s + pad.slice(0, len - s.length)
})

/* ---------- Promise ---------- */
def(Promise, 'allSettled', function (items) {
  return Promise.all(Array.from(items, p => Promise.resolve(p).then(
    value => ({ status: 'fulfilled', value }),
    reason => ({ status: 'rejected', reason }),
  )))
})
def(Promise, 'any', function (items) {
  const list = Array.from(items)
  return new Promise((resolve, reject) => {
    if (!list.length) { reject(new Error('All promises were rejected')); return }
    let left = list.length
    const errors = []
    list.forEach((p, i) => Promise.resolve(p).then(resolve, e => {
      errors[i] = e
      if (--left === 0) { const err = new Error('All promises were rejected'); err.errors = errors; reject(err) }
    }))
  })
})
if (typeof Promise.prototype.finally !== 'function') {
  def(Promise.prototype, 'finally', function (fn) {
    return this.then(v => Promise.resolve(fn()).then(() => v), e => Promise.resolve(fn()).then(() => { throw e }))
  })
}

/* ---------- structuredClone ---------- */
// The app clones plain JSON-shaped state (routines, sessions). Dates, Maps, Sets and typed arrays
// are handled too, cycles are kept; functions throw like the real one.
function clone(v, seen) {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'function') throw new Error('DataCloneError: function could not be cloned')
    return v
  }
  if (seen.has(v)) return seen.get(v)
  if (v instanceof Date) return new Date(v.getTime())
  if (v instanceof RegExp) return new RegExp(v.source, v.flags)
  if (typeof ArrayBuffer !== 'undefined') {
    if (v instanceof ArrayBuffer) return v.slice(0)
    if (ArrayBuffer.isView(v)) return new v.constructor(v)
  }
  if (v instanceof Map) {
    const m = new Map(); seen.set(v, m)
    v.forEach((val, key) => m.set(clone(key, seen), clone(val, seen)))
    return m
  }
  if (v instanceof Set) {
    const s = new Set(); seen.set(v, s)
    v.forEach(val => s.add(clone(val, seen)))
    return s
  }
  if (Array.isArray(v)) {
    const a = new Array(v.length); seen.set(v, a)
    for (let i = 0; i < v.length; i++) a[i] = clone(v[i], seen)
    return a
  }
  const o = {}; seen.set(v, o)
  for (const k of Object.keys(v)) {
    const val = v[k]
    if (typeof val === 'function') throw new Error('DataCloneError: function could not be cloned')
    o[k] = clone(val, seen)
  }
  return o
}
if (typeof G.structuredClone !== 'function') {
  try { G.structuredClone = v => clone(v, new Map()) } catch (e) { /* read-only global */ }
}

/* ---------- TextEncoder / TextDecoder (UTF-8 only) ---------- */
if (typeof G.TextEncoder === 'undefined') {
  G.TextEncoder = class TextEncoder {
    get encoding() { return 'utf-8' }
    encode(str = '') {
      str = String(str)
      const out = []
      for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i)
        if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
          const d = str.charCodeAt(i + 1)
          if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++ }
        } else if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd
        if (c < 0x80) out.push(c)
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
        else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
        else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
      }
      return new Uint8Array(out)
    }
  }
}
if (typeof G.TextDecoder === 'undefined') {
  G.TextDecoder = class TextDecoder {
    get encoding() { return 'utf-8' }
    decode(buf) {
      if (!buf) return ''
      const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : buf)
      let s = ''
      let chunk = []
      const flush = () => { s += String.fromCharCode.apply(null, chunk); chunk = [] }
      for (let i = 0; i < b.length;) {
        const c = b[i]
        let cp, n
        if (c < 0x80) { cp = c; n = 1 }
        else if (c >= 0xc0 && c < 0xe0) { cp = ((c & 31) << 6) | (b[i + 1] & 63); n = 2 }
        else if (c >= 0xe0 && c < 0xf0) { cp = ((c & 15) << 12) | ((b[i + 1] & 63) << 6) | (b[i + 2] & 63); n = 3 }
        else if (c >= 0xf0) { cp = ((c & 7) << 18) | ((b[i + 1] & 63) << 12) | ((b[i + 2] & 63) << 6) | (b[i + 3] & 63); n = 4 }
        else { cp = 0xfffd; n = 1 }
        i += n
        if (cp >= 0x10000) { cp -= 0x10000; chunk.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023)) } else chunk.push(cp)
        if (chunk.length > 8000) flush()
      }
      flush()
      return s
    }
  }
}

/* ---------- btoa / atob (Latin-1 strings, like the browser's) ---------- */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
if (typeof G.btoa !== 'function') {
  G.btoa = function (input) {
    const str = String(input)
    let out = ''
    for (let i = 0; i < str.length; i += 3) {
      const a = str.charCodeAt(i), b = str.charCodeAt(i + 1), c = str.charCodeAt(i + 2)
      if (a > 255 || b > 255 || c > 255) throw new Error('InvalidCharacterError')
      const n = (a << 16) | ((b || 0) << 8) | (c || 0)
      out += B64[n >> 18] + B64[(n >> 12) & 63] + (i + 1 < str.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < str.length ? B64[n & 63] : '=')
    }
    return out
  }
}
if (typeof G.atob !== 'function') {
  G.atob = function (input) {
    const str = String(input).replace(/[\s=]+/g, '')
    let out = ''
    let buf = 0, bits = 0
    for (let i = 0; i < str.length; i++) {
      const v = B64.indexOf(str[i])
      if (v < 0) throw new Error('InvalidCharacterError')
      buf = (buf << 6) | v; bits += 6
      if (bits >= 8) { bits -= 8; out += String.fromCharCode((buf >> bits) & 255) }
    }
    return out
  }
}

export default G
