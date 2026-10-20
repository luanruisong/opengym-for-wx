// Binds a Page or Component to the stores. Replaces React's useStore(selector) re-render model:
// `mapState(S, ctx)` returns a plain object that becomes page data; it is recomputed whenever the
// app store or the UI store changes (while the page is visible) and only the keys whose JSON
// changed are sent through setData.
//
//   import { connectPage } from '../../utils/page.js'
//   Page(connectPage({
//     mapState(S, { state, ui }) { return { routines: S.routines.map(...) } },
//     onReady() { ... },          // all ordinary Page options still work
//   }))
//
// `this.data.theme` holds the theme's CSS-variable string; put style="{{theme}}" on the page's
// root view (class="page"). Lifecycle hooks of yours run after the binding's own; onLoad runs
// only after getApp().ready resolved (exercise data, locale and store loaded).
import { useStore } from '../store/store.js'
import { useUI } from '../store/ui.js'
import { themeStyle, applyChrome } from './theme.js'
import { pageParams } from './nav.js'

function bind(ctx, mapState) {
  ctx.__last = {}
  ctx.__visible = true
  ctx.__refresh = () => {
    if (!ctx.__visible) { ctx.__stale = true; return }
    const state = useStore.getState()
    const ui = useUI.getState()
    let mapped = {}
    try { mapped = mapState ? mapState.call(ctx, state.S, { state, ui }) || {} : {} } catch (e) { console.error(e) }
    mapped.theme = themeStyle(state.S)
    const patch = {}
    let changed = false
    for (const k of Object.keys(mapped)) {
      const json = JSON.stringify(mapped[k] === undefined ? null : mapped[k])
      if (ctx.__last[k] !== json) { ctx.__last[k] = json; patch[k] = mapped[k]; changed = true }
    }
    if (changed) ctx.setData(patch)
  }
  const a = useStore.subscribe(() => ctx.__refresh())
  const b = useUI.subscribe((ui, prev) => { if (ui !== prev) ctx.__refresh() })
  ctx.__unbind = () => { a(); b() }
  ctx.__refresh()
}

export function connectPage(opts) {
  const { mapState, onLoad, onShow, onHide, onUnload } = opts
  return Object.assign({}, opts, {
    onLoad(query) {
      this.query = query || {}
      // Sheet pages read their opener's arguments in mapState too, which runs before your onLoad.
      this.params = pageParams(this.query)
      const app = getApp()
      ;(app.ready || Promise.resolve()).then(() => {
        bind(this, mapState)
        if (onLoad) onLoad.call(this, this.query)
      })
    },
    onShow() {
      this.__visible = true
      if (this.__stale && this.__refresh) { this.__stale = false; this.__refresh() }
      const app = getApp()
      ;(app.ready || Promise.resolve()).then(() => {
        try { applyChrome(useStore.getState().S) } catch (e) { /* theme not ready */ }
        if (onShow) onShow.call(this)
      })
    },
    onHide() {
      this.__visible = false
      if (onHide) onHide.call(this)
    },
    onUnload() {
      if (this.__unbind) this.__unbind()
      if (onUnload) onUnload.call(this)
    },
  })
}

// Same for Component({...}): mapState goes in the options; it runs on attach and on every store
// change until detach. `this.properties` is available inside mapState.
export function connectComponent(opts) {
  const { mapState } = opts
  const lifetimes = Object.assign({}, opts.lifetimes)
  const attached = lifetimes.attached || opts.attached
  const detached = lifetimes.detached || opts.detached
  lifetimes.attached = function () {
    const app = getApp()
    ;(app.ready || Promise.resolve()).then(() => {
      bind(this, mapState)
      if (attached) attached.call(this)
    })
  }
  lifetimes.detached = function () {
    if (this.__unbind) this.__unbind()
    if (detached) detached.call(this)
  }
  const out = Object.assign({}, opts, { lifetimes })
  delete out.mapState
  delete out.attached
  delete out.detached
  return out
}
