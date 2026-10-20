// AddRoutineToSession (frontend/src/sheets.jsx): bring another routine's exercises into the
// running session. The add itself is store/actions.js addRoutineToSession (it toasts).
import { connectPage } from '../../utils/page.js'
import { releasePage, back } from '../../utils/nav.js'
import { useStore } from '../../store/store.js'
import { addRoutineToSession } from '../../store/actions.js'
import { t } from '../../lib/i18n.js'
import { exCount } from '../../lib/format.js'
import { glyphOf } from '../../lib/glyphs.js'

Page(connectPage({
  data: { routines: [] },
  mapState(S) {
    if (!S.active) {
      if (!this.closed) { this.closed = true; setTimeout(() => back(), 0) }
      return {}
    }
    const inSession = new Set([].concat(S.active.routineIds || []))
    return {
      routines: (S.routines || []).map(r => {
        const already = inSession.has(r.id)
        const empty = !(r.ex || []).length
        return {
          id: r.id, name: r.name, icon: glyphOf(r.emoji), sub: exCount((r.ex || []).length),
          disabled: already || empty, tag: already ? t('already added') : empty ? t('no exercises') : '',
        }
      }),
    }
  },
  onUnload() { releasePage(this.query) },
  onPick(e) {
    if (this.closed) return
    const id = e.currentTarget.dataset.id
    const S = useStore.getState().S
    const r = (S.routines || []).find(x => x.id === id)
    const row = this.data.routines.find(x => x.id === id)
    if (!r || !row || row.disabled) return
    this.closed = true
    addRoutineToSession(r)
    back()
  },
}))
