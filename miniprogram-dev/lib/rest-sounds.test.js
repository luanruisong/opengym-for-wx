// #306: the end-of-rest sounds as data. The web app held this table against the Android app's
// RestTone.java; the mini program has no native side, so what is left to hold is the table itself
// (the wav files are rendered from it by tools/gen-sounds.mjs, checked in sound.test.js).
import { describe, expect, it } from 'vitest'
import { CHIME_PEAK, REST_SOUNDS, REST_SOUND_IDS, restSoundOf } from '../../miniprogram/lib/rest-sounds.js'

describe('REST_SOUNDS', () => {
  it('names every sound Settings offers', () => {
    expect(REST_SOUND_IDS).toEqual(['chime', 'classic', 'bell', 'beep', 'whistle', 'soft'])
  })

  it('every note is [freq, dur, when] (and a glide), within what a tone can be', () => {
    for (const id of REST_SOUND_IDS) {
      for (const n of REST_SOUNDS[id].notes) {
        expect(n.length === 3 || n.length === 4, id).toBe(true)
        const [f, d, w] = n
        expect(f > 100 && f < 4000 && d > 0 && d < 2 && w >= 0, id).toBe(true)
      }
      const p = REST_SOUNDS[id].peak
      if (p != null) expect(p > 0 && p <= 1, id).toBe(true)
    }
    expect(REST_SOUNDS.chime.peak).toBe(CHIME_PEAK)
  })

  it('restSoundOf reads the pick, the old classic switch and an unknown name', () => {
    expect(restSoundOf({ restSound: 'whistle' })).toBe('whistle')
    expect(restSoundOf({ classicChime: true, restSound: 'soft' })).toBe('classic')
    expect(restSoundOf({ restSound: 'classic' })).toBe('chime')
    expect(restSoundOf({ restSound: 'nope' })).toBe('chime')
  })
})
