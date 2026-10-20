// Renders the mini program's tones into miniprogram/assets/sounds/*.wav:
//   node miniprogram/tools/gen-sounds.mjs
// The web app synthesised these live with Web Audio (frontend/src/lib/sound.js tone()); this is
// the same envelope rendered offline: from 0.001 an exponential rise to the peak in 20ms, held
// for `hold` of the note, then an exponential fall to 0.001 by its end; a glide is a linear
// frequency ramp. Mono 8-bit PCM at 16 kHz keeps all files together small enough for the main
// package (harmonics above the Nyquist frequency are dropped).
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const MP = join(dirname(fileURLToPath(import.meta.url)), '../../miniprogram')
const { TIMBRES, BEEPS, beepFile, chimeFile } = await import(pathToFileURL(join(MP, 'lib/sound.js')).href)
const { REST_SOUNDS, REST_SOUND_IDS } = await import(pathToFileURL(join(MP, 'lib/rest-sounds.js')).href)

const RATE = 16000
const NYQ = RATE / 2

// Gain of one note at time t (s) into it, as the web app's gain automation would give it.
function envelope(t, dur, peak, hold) {
  const a = 0.02
  if (t < 0 || t > dur) return 0
  if (t < a) return 0.001 * Math.pow(peak / 0.001, t / a)
  const h = Math.max(a, dur * hold)
  if (hold > 0 && t < h) return peak
  const from = hold > 0 ? h : a
  const span = dur - from
  if (span <= 0) return 0
  return peak * Math.pow(0.001 / peak, (t - from) / span)
}

function render(notes, { peak = 0.35, hold = 0, timbre = null } = {}) {
  const end = Math.max(...notes.map(([, dur, when]) => when + dur)) + 0.05
  const n = Math.ceil(end * RATE)
  const out = new Float64Array(n)
  const harm = timbre && TIMBRES[timbre] ? TIMBRES[timbre] : [1]
  // A periodic wave is normalised to a peak of 1 by the browser; do the same per timbre.
  let norm = 0
  for (let i = 0; i < 2000; i++) {
    const ph = (i / 2000) * 2 * Math.PI
    norm = Math.max(norm, Math.abs(harm.reduce((s, h, k) => s + h * Math.sin((k + 1) * ph), 0)))
  }
  for (const [freq, dur, when, glide] of notes) {
    const s0 = Math.floor(when * RATE), len = Math.ceil((dur + 0.05) * RATE)
    let phase = 0
    for (let i = 0; i < len && s0 + i < n; i++) {
      const t = i / RATE
      const f = glide > 0 ? freq + (glide - freq) * Math.min(1, t / dur) : freq
      phase += 2 * Math.PI * f / RATE
      let v = 0
      harm.forEach((h, k) => { if ((k + 1) * f < NYQ) v += h * Math.sin((k + 1) * phase) })
      out[s0 + i] += (v / norm) * envelope(t, dur, peak, hold)
    }
  }
  return out
}

function wav(samples) {
  const data = Buffer.alloc(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    data[i] = Math.round(128 + v * 127)
  }
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8)
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22)
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE, 28); h.writeUInt16LE(1, 32); h.writeUInt16LE(8, 34)
  h.write('data', 36); h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}

const dir = join(MP, 'assets/sounds')
mkdirSync(dir, { recursive: true })
for (const f of readdirSync(dir)) if (f.endsWith('.wav')) unlinkSync(join(dir, f))
const files = {}
for (const [f, d] of BEEPS) files[beepFile(f, d)] = render([[f, d, 0]])
for (const id of REST_SOUND_IDS) {
  const s = REST_SOUNDS[id]
  files[chimeFile(id)] = id === 'classic' ? render(s.notes) : render(s.notes, { peak: s.peak, hold: s.hold, timbre: s.timbre })
}
let total = 0
for (const [name, samples] of Object.entries(files)) {
  writeFileSync(join(dir, name), wav(samples))
  const size = statSync(join(dir, name)).size
  total += size
  console.log(name.padEnd(22), size)
}
console.log('total'.padEnd(22), total)
