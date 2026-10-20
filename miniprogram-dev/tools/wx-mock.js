// A small stand-in for the mini program's `wx` global, enough for lib code under vitest.
// Calls are recorded on wx.__calls (name → array of argument lists) for tests that look.
export function installWxMock() {
  const store = new Map()
  const files = new Map()   // path → Uint8Array | string
  const calls = {}
  const rec = name => (...args) => { (calls[name] ||= []).push(args); const o = args[0]; if (o && typeof o.success === 'function') o.success({}); if (o && typeof o.complete === 'function') o.complete({}) }
  const enoent = p => Object.assign(new Error('no such file or directory ' + p), { errMsg: 'fail no such file or directory ' + p })
  const toBytes = (data, encoding) => {
    if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0))
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
    if (encoding === 'base64') return new Uint8Array(Buffer.from(String(data), 'base64'))
    return new Uint8Array(Buffer.from(String(data), 'utf8'))
  }
  const fromBytes = (bytes, encoding) => {
    if (!encoding || encoding === 'binary') return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    return Buffer.from(bytes).toString(encoding === 'utf-8' ? 'utf8' : encoding)
  }
  const dirs = new Set(['wxfile://usr'])
  const fs = {
    writeFileSync(path, data, encoding) { files.set(path, toBytes(data, encoding)) },
    readFileSync(path, encoding, position, length) {
      (calls.readFileSync ||= []).push([path, encoding, position, length])
      if (!files.has(path)) throw enoent(path)
      let b = files.get(path)
      if (position != null || length != null) { const p = position || 0; b = b.subarray(p, length == null ? b.length : p + length) }
      return fromBytes(b, encoding)
    },
    unlinkSync(path) { if (!files.has(path)) throw enoent(path); files.delete(path) },
    accessSync(path) { if (!files.has(path) && !dirs.has(path)) throw enoent(path) },
    mkdirSync(path, recursive) {
      if (dirs.has(path)) throw Object.assign(new Error('file already exists ' + path), { errMsg: 'fail file already exists ' + path })
      dirs.add(path)
    },
    rmdirSync(path, recursive) { const pre = path.replace(/\/$/, '') + '/'; for (const k of [...files.keys()]) if (k.startsWith(pre)) files.delete(k); dirs.delete(path) },
    statSync(path) { if (files.has(path)) return { size: files.get(path).byteLength, isFile: () => true, isDirectory: () => false }; if (dirs.has(path)) return { size: 0, isFile: () => false, isDirectory: () => true }; throw enoent(path) },
    readdirSync(path) { const pre = path.replace(/\/$/, '') + '/'; return [...files.keys()].filter(k => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map(k => k.slice(pre.length)) },
    copyFileSync(src, dest) { if (!files.has(src)) throw enoent(src); files.set(dest, files.get(src).slice()) },
    renameSync(src, dest) { if (!files.has(src)) throw enoent(src); files.set(dest, files.get(src)); files.delete(src) },
    getFileInfo(o) { if (files.has(o.filePath)) o.success && o.success({ size: files.get(o.filePath).byteLength }); else o.fail && o.fail({ errMsg: 'fail' }) },
  }
  const audio = () => {
    const a = { src: '', volume: 1, play() { (calls.audioPlay ||= []).push([a.src]) }, stop() {}, pause() {}, destroy() {}, seek() {},
      onEnded(fn) { a._ended = fn }, onError(fn) { a._error = fn }, offEnded() {}, offError() {}, onCanplay() {} }
    ;(calls.createInnerAudioContext ||= []).push([a])
    return a
  }
  globalThis.wx = {
    __calls: calls, __store: store, __files: files,
    env: { USER_DATA_PATH: 'wxfile://usr' },
    getStorageSync: k => (store.has(k) ? store.get(k) : ''),
    setStorageSync: (k, v) => { store.set(k, v) },
    removeStorageSync: k => { store.delete(k) },
    clearStorageSync: () => store.clear(),
    getStorageInfoSync: () => ({ keys: [...store.keys()], currentSize: 0, limitSize: 10240 }),
    getFileSystemManager: () => fs,
    createInnerAudioContext: audio,
    setInnerAudioOption: rec('setInnerAudioOption'),
    vibrateShort: rec('vibrateShort'),
    vibrateLong: rec('vibrateLong'),
    setKeepScreenOn: rec('setKeepScreenOn'),
    setClipboardData: rec('setClipboardData'),
    getClipboardData: o => { (calls.getClipboardData ||= []).push([o]); o && o.success && o.success({ data: '' }) },
    showToast: rec('showToast'),
    navigateTo: rec('navigateTo'), redirectTo: rec('redirectTo'), switchTab: rec('switchTab'), navigateBack: rec('navigateBack'),
    getSystemInfoSync: () => ({ platform: 'devtools' }),
    onAppHide: rec('onAppHide'),
    // Layout queries answer with no nodes (nothing is laid out under Node); scrolling is recorded.
    createSelectorQuery: () => { const q = { in: () => q, select: () => q, selectAll: () => q, selectViewport: () => q, boundingClientRect: () => q, scrollOffset: () => q, fields: () => q, node: () => q, exec: cb => { cb && cb([]) } }; return q },
    pageScrollTo: rec('pageScrollTo'),
  }
  globalThis.getCurrentPages = () => []
  globalThis.getApp = () => ({ globalData: {} })
}
