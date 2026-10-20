// <qr-code value="{{card.value}}" size="{{230}}" />  — frontend/src/components/QrCanvas.jsx on a
// canvas type="2d". Regenerated from the value every time (we never store a picture of a card).
// Solid black on white with a two-module quiet zone, as the original: turnstile readers want
// contrast, not theme colours. Draws nothing for an empty or unencodable value.
import { qrMatrix } from '../../checkin/qr.js'

Component({
  options: { styleIsolation: 'apply-shared', virtualHost: true },
  properties: {
    value: { type: String, value: '' },
    size: { type: Number, value: 230 },
  },
  data: { ok: false },
  observers: {
    'value, size'() { if (this._ready) this.draw() },
  },
  lifetimes: {
    ready() { this._ready = true; this.draw() },
  },
  methods: {
    draw() {
      const { value, size } = this.properties
      const m = qrMatrix(value)
      if (!m) { this.setData({ ok: false }); return }
      this.createSelectorQuery().select('#qr').fields({ node: true, size: true }).exec(res => {
        const canvas = res && res[0] && res[0].node
        if (!canvas) return
        let dpr = 2
        try { dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2 } catch (e) { /* default */ }
        const px = Math.round(size * dpr)
        canvas.width = px
        canvas.height = px
        const ctx = canvas.getContext('2d')
        const pad = 2
        const n = m.size + pad * 2
        const cell = px / n
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, px, px)
        ctx.fillStyle = '#000000'
        for (let y = 0; y < m.size; y++) {
          const row = m.rows[y]
          for (let x = 0; x < m.size; x++) {
            if (!row[x]) continue
            // Whole device pixels on both edges, so neighbouring modules meet with no seam.
            const x0 = Math.floor((x + pad) * cell), y0 = Math.floor((y + pad) * cell)
            const x1 = Math.floor((x + pad + 1) * cell), y1 = Math.floor((y + pad + 1) * cell)
            ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
          }
        }
        this.setData({ ok: true })
      })
    },
  },
})
