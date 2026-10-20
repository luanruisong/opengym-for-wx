// <timer-flash />  — the visual alert at the end of a rest (frontend/src/components/TimerFlash.jsx):
// flips the app's real light/dark theme on and off twice (~2.4 s) instead of laying a rectangle
// over the screen, and always settles back on the user's theme. Triggered by useUI().flashTimer()
// (timerFlashId changes; it only flashes when S.timerFlash is on, which useUI checks).
//
// Renders nothing. Several pages may carry one: a flash runs once whichever instance sees it
// first (module state). It works by overriding utils/theme.js's theme and poking the store, so
// every connected page and component repaints. properties / events: none.
import { connectComponent } from '../../utils/page.js'
import { useStore } from '../../store/store.js'
import { useUI } from '../../store/ui.js'
import { setThemeOverride, savedTheme } from '../../utils/theme.js'

let handled = null      // the last timerFlashId flashed (or seen at load)
let timers = []

function stopFlash() {
  timers.forEach(clearTimeout)
  timers = []
  setThemeOverride(null)
}

function runFlash() {
  stopFlash()
  const S = useStore.getState().S
  const original = savedTheme(S)
  const opposite = original === 'light' ? 'dark' : 'light'
  const steps = [opposite, original, opposite, null]
  steps.forEach((th, i) => timers.push(setTimeout(() => {
    setThemeOverride(th)
    useStore.setState({})
  }, i * 600)))
}

Component(connectComponent({
  options: { styleIsolation: 'apply-shared' },
  data: { id: 0 },
  mapState(S, { ui }) { return { id: ui.timerFlashId || 0 } },
  observers: {
    id(id) {
      if (handled === null) { handled = id; return }    // what was there before this page opened
      if (!id || id === handled) return
      handled = id
      runFlash()
    },
  },
  lifetimes: {
    attached() { if (handled === null) handled = useUI.getState().timerFlashId || 0 },
  },
}))
