// <toast-x tabbar />  — the app's one toast (frontend/src/components/Toast.jsx), bound to
// useUI().toastMsg / toastAction. Put one on every page that can toast (all of them: the store
// toasts from anywhere). Mostly text; with an action (the Undo after a set is removed,
// toast(msg, { action: '撤销', onAction })) it carries a button, stays 5 s and holds still while a
// finger rests on it.
//
// properties
//   tabbar  Boolean false  the page has the custom tab bar: sit above it
// The toast also rises above the rest timer bar while one runs. events: none.
import { connectComponent } from '../../utils/page.js'
import { useUI } from '../../store/ui.js'

Component(connectComponent({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    tabbar: { type: Boolean, value: false },
  },
  data: { msg: '', text: '', show: false, act: '', actId: 0, resting: false },
  mapState(S, { ui }) {
    const a = ui.toastAction
    return {
      msg: ui.toastMsg || '',
      show: !!ui.toastMsg,
      act: ui.toastMsg && a ? String(a.label || '') : '',
      actId: a ? a.id : 0,
      resting: !!(ui.timer || ui.work),
    }
  },
  observers: {
    // keep the last text while fading out
    msg(m) { if (m) this.setData({ text: m }) },
  },
  methods: {
    onAct() { useUI.getState().runToastAction() },
    onHold() { if (this.data.act) useUI.getState().pauseToast() },
    onRelease() { if (this.data.act) useUI.getState().resumeToast() },
  },
}))
