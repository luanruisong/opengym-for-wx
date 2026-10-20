// QR matrix for a gym card's value (frontend/src/lib/qr.js, minus the canvas half: the
// <qr-code> component draws the matrix itself). Medium error correction, as the original.
// Modes leave out shift_jis: its character test needs TextDecoder('sjis'), which the mini
// program does not have; a non-ASCII value is encoded as UTF-8 bytes instead.
import { generate, correction, mode } from './lean-qr.js'

// The symbologies we can redraw: only QR (the original's canRenderFmt). wx.scanCode reports
// scanType 'QR_CODE'; stored cards carry 'qrcode'.
export function normalizeFmt(fmt) {
  const s = String(fmt || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (s === 'qr' || s === 'qrcode') return 'qrcode'
  return s
}
export const canRenderFmt = fmt => normalizeFmt(fmt) === 'qrcode'

const MODES = [mode.numeric, mode.alphaNumeric, mode.ascii, mode.iso8859_1, mode.utf8]

// { size, rows: boolean[][] } or null for an empty / unencodable value.
export function qrMatrix(value) {
  if (!value) return null
  try {
    const code = generate(String(value), { minCorrectionLevel: correction.M, modes: MODES })
    const rows = []
    for (let y = 0; y < code.size; y++) {
      const r = []
      for (let x = 0; x < code.size; x++) r.push(code.get(x, y))
      rows.push(r)
    }
    return { size: code.size, rows }
  } catch (e) {
    console.error('qr', e)
    return null
  }
}
