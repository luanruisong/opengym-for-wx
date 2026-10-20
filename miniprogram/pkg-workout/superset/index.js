// SupersetSettings (frontend/src/sheets.jsx, #292): a superset's own name and its rest between
// rounds. params: { meta: { name, rest }, onSave({ name, rest }) }
import { connectPage } from '../../utils/page.js'
import { pageParams, releasePage, back } from '../../utils/nav.js'
import { durationSheet } from '../../utils/sheets.js'
import { t } from '../../lib/i18n.js'
import { SG_NAME_MAX } from '../../lib/superset-meta.js'
import { REST_MAX, fmtRest } from '../../lib/duration.js'

const restText = rest => (rest > 0 ? fmtRest(rest) : t('Longest exercise rest'))

Page(connectPage({
  data: { name: '', rest: 0, restText: '', max: SG_NAME_MAX },
  onLoad(query) {
    const p = pageParams(query)
    this.params = p
    const meta = p.meta || {}
    const rest = meta.rest || 0
    this.setData({ name: meta.name || '', rest, restText: restText(rest) })
  },
  onUnload() { releasePage(this.query) },
  onInput(e) { this.setData({ name: e.detail.value }) },
  onRest() {
    durationSheet({
      title: t('Rest after each round'), value: this.data.rest, max: REST_MAX, off: t('Longest exercise rest'),
      footer: t('Without one, the superset rests as long as its longest exercise rest.'),
      onDone: v => this.setData({ rest: v, restText: restText(v) }),
    })
  },
  onSave() {
    if (this.closed) return
    this.closed = true
    const cb = this.params && this.params.onSave
    if (typeof cb === 'function') {
      try { cb({ name: this.data.name.trim().slice(0, SG_NAME_MAX), rest: this.data.rest }) } catch (e) { console.error(e) }
    }
    back()
  },
}))
