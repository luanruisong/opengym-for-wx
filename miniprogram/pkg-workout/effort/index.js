// EffortPicker (frontend/src/sheets.jsx): how hard a set was, in the profile's scale.
// params: { kind: 'rir' | 'rpe', value, onPick(v) } — v on that same scale, null clears.
//
// A preset row commits on the spot (that is what makes it one tap: onPick ticks the set and
// starts the rest). Typing in the exact field only moves the page's own value; it is committed
// once, when the page goes away (Done, Clear, or the back button), as the original did on
// unmount, so a half-typed "1" of "10" never ticks a set.
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage, back } from '../../utils/nav.js'
import { t } from '../../lib/i18n.js'
import { fmtNum } from '../../lib/format.js'
import { EFFORT, stepEffort, capEffort } from '../../lib/history.js'
import { EFFORT_PRESETS, effortColor, rirOf, toScale } from '../../lib/effort.js'

Page(connectPage({
  data: { hint: '', exactLabel: '', presets: [], v: null, tint: '', showDone: false, showClear: false },
  onLoad(query) {
    const p = pageParams(query)
    this.params = p
    this.kind = p.kind === 'rpe' ? 'rpe' : 'rir'
    this.orig = p.value == null ? null : p.value
    this.typed = this.orig
    const hd = EFFORT[this.kind].hd
    this.setData({
      hint: t('Tap how many reps you had left, or type an exact {0}.', hd),
      exactLabel: t('Exact {0}', hd),
    })
    this.render(this.orig)
  },
  onUnload() {
    // Gone by the back button with a typed value: committed now, once the page has left (the
    // callback may tick the set and open the complete page).
    if (!this.committed && this.typed !== this.orig) {
      this.committed = true
      const v = this.typed
      const pick = this.pick.bind(this)
      setTimeout(() => pick(v), 50)
    }
    releasePage(this.query)
  },
  render(v) {
    const kind = this.kind
    const curRir = rirOf(kind === 'rpe' ? { rpe: v } : { rir: v })
    const color = effortColor(curRir)
    this.setData({
      v,
      tint: color ? 'color:' + color + ';border-color:' + color : '',
      showDone: v != null && v !== this.orig,
      showClear: v != null,
      presets: EFFORT_PRESETS.map(pr => ({
        rir: pr.rir,
        label: fmtNum(toScale(kind, pr.rir)) + (pr.tail ? '+' : ''),
        feel: t(pr.feel),
        color: pr.color,
        on: curRir != null && curRir === pr.rir,
      })),
    })
  },
  set(nv) { this.typed = nv; this.render(nv) },
  pick(v) {
    const fn = this.params && this.params.onPick
    if (typeof fn === 'function') { try { fn(v) } catch (e) { console.error(e) } }
  },
  commit(v) {
    if (this.committed) return
    this.committed = true
    // Back first, then the answer: onPick ticks the set, which may start the rest and open the
    // complete page; that must happen from the workout page, not race this page's back.
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ success: () => setTimeout(() => this.pick(v), 0), fail: () => this.pick(v) })
    } else { this.pick(v); back() }
  },
  onPreset(e) { this.commit(toScale(this.kind, e.currentTarget.dataset.rir)) },
  onDec() { this.set(stepEffort(this.kind, this.typed, -1)) },
  onInc() { this.set(stepEffort(this.kind, this.typed, 1)) },
  onType(e) { this.set(capEffort(this.kind, e.detail.value)) },
  onDone() { this.commit(this.typed) },
  onClear() { this.commit(null) },
}))
