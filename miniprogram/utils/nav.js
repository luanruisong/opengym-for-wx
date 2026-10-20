// Page-to-page plumbing. The web app opened "sheets" as React components with callbacks; here a
// sheet is a page of its own. openPage hands it any JS values (functions included) through an
// in-memory registry keyed by `_k`, and the page answers through sendResult.
//
//   openPage('/pkg-library/picker/index', { title: '换动作' }, { onResult: ex => ... })
//   // in the picker page:
//   onLoad(q) { this.params = pageParams(q) }  ...  sendResult(q, ex); wx.navigateBack()
//   onUnload() { releasePage(q) }
import { resolveRoute } from './routes.js'

const pending = new Map()
let seq = 0

export function openPage(url, params = {}, { onResult, redirect = false } = {}) {
  const k = 'k' + (++seq)
  pending.set(k, { params, onResult })
  const full = url + (url.includes('?') ? '&' : '?') + '_k=' + k
  const go = redirect ? wx.redirectTo : wx.navigateTo
  go({
    url: full,
    fail: err => { pending.delete(k); console.error('openPage failed', url, err) },
  })
  return k
}

// The params object openPage was given ({} when the page was opened some other way).
export function pageParams(query) {
  const e = query && pending.get(query._k)
  return (e && e.params) || {}
}

// Calls the opener's onResult. Can be called more than once (a page that reports live changes).
export function sendResult(query, data) {
  const e = query && pending.get(query._k)
  if (e && typeof e.onResult === 'function') {
    try { e.onResult(data) } catch (err) { console.error(err) }
  }
}

export function releasePage(query) {
  if (query && query._k) pending.delete(query._k)
}

// Navigates by web route ('/plan/r/abc', '/settings/data', '/home'). `replace` redirects instead
// of pushing. Returns false for a route this build has no page for.
export function navTo(to, { replace = false } = {}) {
  const r = resolveRoute(to)
  if (!r) { console.warn('no page for route', to); return false }
  if (r.tab) {
    if (Object.keys(r.query).length) getApp().globalData.tabQuery = { url: r.url, query: r.query }
    wx.switchTab({ url: r.url })
  } else if (replace) {
    wx.redirectTo({ url: r.url })
  } else {
    // The page stack holds 10 pages; past that navigateTo fails, so fall back to redirect.
    const depth = getCurrentPages().length
    ;(depth >= 9 ? wx.redirectTo : wx.navigateTo)({ url: r.url })
  }
  return true
}

// A tab page's one-off query from navTo('/stats?focus=x'): read once in onShow, then cleared.
export function takeTabQuery(url) {
  const app = getApp()
  const q = app.globalData.tabQuery
  if (q && q.url === url) { app.globalData.tabQuery = null; return q.query }
  return null
}

export function back(delta = 1) {
  if (getCurrentPages().length > 1) wx.navigateBack({ delta })
  else wx.switchTab({ url: '/pages/home/index' })
}
