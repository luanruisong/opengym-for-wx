// localStorage-shaped wrapper over wx storage, so ported code can keep its getItem/setItem calls.
// Values are strings, like localStorage. Every call swallows errors (storage full: 10MB per mini
// program) and reports them through the return value instead.
export const storage = {
  getItem(key) {
    try {
      const v = wx.getStorageSync(key)
      return v === '' || v === undefined ? null : String(v)
    } catch (e) { return null }
  },
  setItem(key, value) {
    try { wx.setStorageSync(key, String(value)); return true } catch (e) { return false }
  },
  removeItem(key) {
    try { wx.removeStorageSync(key) } catch (e) { /* nothing to remove */ }
  },
  clear() {
    try { wx.clearStorageSync() } catch (e) { /* ignore */ }
  },
  // { currentSize, limitSize } in KB, or null.
  info() {
    try { return wx.getStorageInfoSync() } catch (e) { return null }
  },
}
