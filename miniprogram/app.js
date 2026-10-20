// App shell. The polyfills come first: lib code that runs at import time may already use them.
import './utils/polyfill.js'
import { loadCoreData } from './lib/boot-data.js'
import { useStore } from './store/store.js'
import { resetChrome } from './utils/theme.js'
import { setPlayOnSilent, setVibrate } from './lib/sound.js'
import { setWeightDecimals } from './lib/format.js'
import { setKeepAwake } from './lib/wakelock.js'

// Module-level display and sound settings the web app's App.jsx re-applied whenever S changed.
// Applied at boot and on every store change after it (cheap: each is a plain assignment).
let applied = ''
function applySettings(S) {
  if (!S) return
  const key = [!!S.soundOnSilent, S.vibrate !== false, S.wdec].join('|')
  if (key === applied) return
  applied = key
  setPlayOnSilent(!!S.soundOnSilent)
  setVibrate(S.vibrate !== false)
  setWeightDecimals(S.wdec)
}

App({
  globalData: {
    tabQuery: null,   // utils/nav.js: a tab page's one-off query (navTo('/stats?focus=x'))
    bootError: null,  // what went wrong at boot, for a page that wants to say so
  },

  onLaunch() {
    // Every page waits on this (utils/page.js). It always resolves: a failed load leaves the
    // app running on whatever did load (an empty state at worst) rather than blank pages that
    // wait forever.
    this.ready = Promise.resolve()
      .then(() => loadCoreData())
      .catch(err => this.bootFailed('data', err))
      .then(() => useStore.getState().init())
      .catch(err => this.bootFailed('store', err))
      .then(() => {
        const S = useStore.getState().S
        applySettings(S)
        useStore.subscribe(st => applySettings(st.S))
        // A workout left running when the app closed keeps the screen awake again, as it did.
        if (S && S.active && S.keepAwake !== false) setKeepAwake(true)
      })
      .catch(err => console.error('[boot] settings', err))

    // S.theme 'system' follows the OS live. Pages recompute their theme in mapState on any store
    // change, so an empty setState is enough to repaint every connected page and component.
    if (wx.onThemeChange) {
      wx.onThemeChange(() => {
        resetChrome()
        let S = null
        try { S = useStore.getState().S } catch (e) { /* not loaded yet */ }
        if (S && S.theme === 'system') useStore.setState({})
      })
    }
  },

  bootFailed(stage, err) {
    console.error('[boot] ' + stage + ' failed', err)
    this.globalData.bootError = { stage, message: String((err && err.message) || err) }
    try { wx.showToast({ title: '加载失败，请重启小程序', icon: 'none', duration: 3000 }) } catch (e) { /* no UI yet */ }
  },

  onError(msg) {
    console.error('[app] ', msg)
  },

  onUnhandledRejection(res) {
    console.error('[app] unhandled rejection', res && res.reason)
  },
})
