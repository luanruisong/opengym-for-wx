// RenameWorkout (frontend/src/sheets.jsx): the running session's title, up to 60 characters.
import { connectPage } from '../../utils/page.js'
import { releasePage, back } from '../../utils/nav.js'
import { useStore } from '../../store/store.js'

Page(connectPage({
  data: { name: '', canSave: false },
  mapState(S) {
    if (this.loaded && !S.active && !this.closed) { this.closed = true; setTimeout(() => back(), 0) }
    return {}
  },
  onLoad() {
    this.loaded = true
    const A = useStore.getState().S.active
    if (!A) { this.closed = true; back(); return }
    const name = A.name || ''
    this.setData({ name, canSave: name.trim().length > 0 })
  },
  onUnload() { releasePage(this.query) },
  onInput(e) {
    const name = e.detail.value
    this.setData({ name, canSave: name.trim().slice(0, 60).length > 0 })
  },
  onSave() {
    const trimmed = this.data.name.trim().slice(0, 60)
    if (!trimmed || this.closed) return
    useStore.getState().update(s => {
      if (!s.active) return
      s.active.name = trimmed
      s.active.customName = true
    })
    this.closed = true
    back()
  },
}))
