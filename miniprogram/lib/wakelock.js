// Keeps the display on while a workout is running, so nobody has to unlock their phone between
// sets. MINI PROGRAM PORT: wx.setKeepScreenOn instead of the Screen Wake Lock API, and no React
// hook (useWakeLock is gone: call setKeepAwake(on) from the page's onShow / onHide / onUnload).
//
// wx.setKeepScreenOn only lasts while the mini program is in the foreground, and the platform
// restores it by itself when the user comes back, so there is nothing to re-acquire by hand.
let wanted = false

export const wakeLockSupported = () => typeof wx !== 'undefined' && !!wx && typeof wx.setKeepScreenOn === 'function'

const apply = on => {
  if (!wakeLockSupported()) return
  try { wx.setKeepScreenOn({ keepScreenOn: !!on, fail() { /* nothing the user could act on */ } }) } catch (e) { /* */ }
}

export function requestWakeLock() {
  if (wanted) return
  wanted = true
  apply(true)
}

export function releaseWakeLock() {
  if (!wanted) return
  wanted = false
  apply(false)
}

// Holds the lock while `on` is true (what useWakeLock(enabled) did).
export function setKeepAwake(on) { if (on) requestWakeLock(); else releaseWakeLock() }
export const wakeLockHeld = () => wanted
