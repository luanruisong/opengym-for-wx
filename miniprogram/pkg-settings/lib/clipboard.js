// GENERATED from lib-shared/clipboard.js by tools/sync-shared.mjs. Edit lib-shared/clipboard.js, then rerun.
// Copies text to the clipboard and says whether it did. MINI PROGRAM PORT: wx.setClipboardData
// (which shows its own "内容已复制" toast) instead of the Clipboard API / selection copy.
export function copyText(text) {
  return new Promise(resolve => {
    if (typeof wx === 'undefined' || !wx || typeof wx.setClipboardData !== 'function') { resolve(false); return }
    try {
      wx.setClipboardData({ data: String(text ?? ''), success: () => resolve(true), fail: () => resolve(false) })
    } catch (e) { resolve(false) }
  })
}

// The clipboard's text, or null when it could not be read.
export function readText() {
  return new Promise(resolve => {
    if (typeof wx === 'undefined' || !wx || typeof wx.getClipboardData !== 'function') { resolve(null); return }
    try {
      wx.getClipboardData({ success: r => resolve(r && typeof r.data === 'string' ? r.data : ''), fail: () => resolve(null) })
    } catch (e) { resolve(null) }
  })
}
