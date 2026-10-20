// Mini program port of lib/sound.js: tones are pre-rendered wav files (tools/gen-sounds.mjs)
// played through wx.createInnerAudioContext, buzzes go through wx.vibrateShort / vibrateLong.
// Each test gets a fresh module and a fake `wx` that records what the real one would be asked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

let sound, w, played, made, vib, platform
// The mini program root, where assets/sounds lives (this test sits in miniprogram-dev/lib).
const assets = fileURLToPath(new URL('../../miniprogram/', import.meta.url))

beforeEach(async () => {
  vi.useFakeTimers()
  played = []; made = []; vib = []; platform = 'ios'
  w = {
    createInnerAudioContext() {
      const a = { src: '', stops: 0, destroyed: false, play() { played.push(a.src) }, stop() { a.stops++ }, destroy() { a.destroyed = true }, onError() {} }
      made.push(a)
      return a
    },
    setInnerAudioOption: vi.fn(),
    vibrateShort: o => vib.push(['short', o.type, Date.now()]),
    vibrateLong: () => vib.push(['long', Date.now()]),
    getSystemInfoSync: () => ({ platform }),
  }
  vi.stubGlobal('wx', w)
  vi.resetModules()
  sound = await import('../../miniprogram/lib/sound.js')
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('the module', () => {
  it('loads and stays silent without wx (Node, a test)', async () => {
    vi.stubGlobal('wx', undefined)
    vi.resetModules()
    const s = await import('../../miniprogram/lib/sound.js')
    expect(() => { s.beep(true, 880, 0.15); s.chime(true, 'bell'); s.vibrate([200, 100, 200]); s.setPlayOnSilent(true); s.unlock(true) }).not.toThrow()
    expect(s.vibrateSupported()).toBe(false)
    expect(s.playOnSilentSupported()).toBe(false)
  })

  it('has a rendered file for every sound it can play', () => {
    for (const f of sound.SOUND_FILES()) {
      const p = assets + 'assets/sounds/' + f
      expect(existsSync(p), f).toBe(true)
      expect(statSync(p).size, f).toBeGreaterThan(44)
    }
  })
})

describe('beep', () => {
  it('makes no sound and no audio context with sounds off', () => {
    sound.beep(false, 880, 0.15)
    sound.unlock(false)
    sound.chime(false, 'chime')
    expect(made).toHaveLength(0)
    expect(played).toEqual([])
  })

  it('plays the file rendered for that pitch and length', () => {
    sound.beep(true, 660, 0.1)
    sound.beep(true, 1040, 0.12)
    expect(played).toEqual(['/assets/sounds/beep-660-100.wav', '/assets/sounds/beep-1040-120.wav'])
  })

  it('plays the nearest file for a beep nobody rendered, and the default one with no arguments', () => {
    sound.beep(true, 1000, 0.1)
    sound.beep(true)
    expect(played).toEqual(['/assets/sounds/beep-1040-120.wav', '/assets/sounds/beep-880-180.wav'])
  })

  it('waits `when` seconds before a later tone (the finish fanfare)', () => {
    sound.beep(true, 880, 0.15); sound.beep(true, 1100, 0.15, 0.18); sound.beep(true, 1320, 0.3, 0.36)
    expect(played).toEqual(['/assets/sounds/beep-880-150.wav'])
    vi.advanceTimersByTime(180)
    expect(played).toHaveLength(2)
    vi.advanceTimersByTime(180)
    expect(played).toEqual(['/assets/sounds/beep-880-150.wav', '/assets/sounds/beep-1100-150.wav', '/assets/sounds/beep-1320-300.wav'])
  })

  it('reuses one audio context per file, restarting it', () => {
    sound.beep(true, 660, 0.1); sound.beep(true, 660, 0.1); sound.beep(true, 660, 0.1)
    expect(made).toHaveLength(1)
    expect(played).toHaveLength(3)
    expect(made[0].stops).toBe(3)
  })

  it('disposeSounds destroys the pooled contexts', () => {
    sound.beep(true, 660, 0.1); sound.chime(true, 'bell')
    sound.disposeSounds()
    expect(made.every(a => a.destroyed)).toBe(true)
    sound.beep(true, 660, 0.1)
    expect(made).toHaveLength(3)
  })

  it('unlock warms a context without a sound', () => {
    sound.unlock(true)
    expect(made).toHaveLength(1)
    expect(played).toEqual([])
  })

  it('survives an audio context that throws', () => {
    w.createInnerAudioContext = () => { throw new Error('no audio') }
    expect(() => sound.beep(true, 660, 0.1)).not.toThrow()
  })
})

describe('the end-of-rest sounds (Settings → Sound)', () => {
  it('offers the chime, the classic beeps and four more, each its own file', () => {
    expect(sound.REST_SOUND_IDS).toEqual(['chime', 'classic', 'bell', 'beep', 'whistle', 'soft'])
    for (const id of sound.REST_SOUND_IDS) sound.chime(true, id)
    expect(new Set(played).size).toBe(6)
    expect(played[2]).toBe('/assets/sounds/rest-bell.wav')
  })

  it('falls back to the chime for a name it does not know, and true still means classic', () => {
    sound.chime(true, 'kazoo')
    sound.chime(true, true)
    sound.chime(true)
    expect(played).toEqual(['/assets/sounds/rest-chime.wav', '/assets/sounds/rest-classic.wav', '/assets/sounds/rest-chime.wav'])
  })

  it('reads the profile\'s pick, with the old classic switch and an older app\'s later choice', () => {
    expect(sound.restSoundOf({})).toBe('chime')
    expect(sound.restSoundOf(undefined)).toBe('chime')
    expect(sound.restSoundOf({ restSound: 'bell' })).toBe('bell')
    expect(sound.restSoundOf({ restSound: 'kazoo' })).toBe('chime')
    expect(sound.restSoundOf({ classicChime: true })).toBe('classic')
    expect(sound.restSoundOf({ restSound: 'bell', classicChime: true })).toBe('classic')
    expect(sound.restSoundOf({ restSound: 'classic', classicChime: false })).toBe('chime')
  })
})

describe('play on silent', () => {
  it('is offered on iOS only, where the mute switch silences a mini program', async () => {
    expect(sound.playOnSilentSupported()).toBe(true)
    expect(sound.appleTouchDevice()).toBe(true)
    platform = 'android'
    expect(sound.playOnSilentSupported()).toBe(false)
    expect(sound.appleTouchDevice()).toBe(false)
  })

  it('on ignores the mute switch, off obeys it; both mix with other apps\' audio', () => {
    sound.setPlayOnSilent(true)
    sound.setPlayOnSilent(false)
    expect(w.setInnerAudioOption.mock.calls.map(([o]) => [o.obeyMuteSwitch, o.mixWithOther])).toEqual([[false, true], [true, true]])
  })
})

describe('vibrate', () => {
  it('turns a navigator.vibrate pattern into long and short wx buzzes at their place in it', () => {
    expect(sound.vibrationPlan([200, 100, 200])).toEqual([{ at: 0, kind: 'long' }, { at: 400, kind: 'long' }])
    expect(sound.vibrationPlan(30)).toEqual([{ at: 0, kind: 'short', type: 'heavy' }])
    expect(sound.vibrationPlan(15)).toEqual([{ at: 0, kind: 'short', type: 'medium' }])
    expect(sound.vibrationPlan(4)).toEqual([{ at: 0, kind: 'short', type: 'light' }])
    expect(sound.vibrationPlan([20, 50, 20])).toEqual([{ at: 0, kind: 'short', type: 'medium' }, { at: 70, kind: 'short', type: 'medium' }])
    expect(sound.vibrationPlan([0, null, -5])).toEqual([])
  })

  it('buzzes by default, the later parts of a pattern on a timer', () => {
    sound.vibrate([200, 100, 200])
    expect(vib.map(v => v[0])).toEqual(['long'])
    vi.advanceTimersByTime(400)
    expect(vib.map(v => v[0])).toEqual(['long', 'long'])
  })

  it('stays still once switched off, and buzzes again once switched back on', () => {
    sound.setVibrate(false)
    sound.vibrate(30)
    expect(vib).toEqual([])
    sound.setVibrate(true)
    sound.vibrate(30)
    expect(vib.map(v => v.slice(0, 2))).toEqual([['short', 'heavy']])
  })

  it('reads a profile that never chose as on', () => {
    sound.setVibrate(false)
    sound.setVibrate(undefined)
    sound.vibrate(30)
    expect(vib).toHaveLength(1)
  })

  it('is offered wherever wx can vibrate (iOS included)', () => {
    expect(sound.vibrateSupported()).toBe(true)
    delete w.vibrateShort
    expect(sound.vibrateSupported()).toBe(false)
    expect(() => sound.vibrate(30)).not.toThrow()
  })
})

describe('alertBuzz', () => {
  const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }
  afterEach(() => { sound.setAlarmBuzzer(null) })

  it('without a native buzzer it is the ordinary buzz', () => {
    sound.alertBuzz([200, 100, 200])
    expect(vib).toHaveLength(1)
  })

  it('with one it goes there, and not also the ordinary way', async () => {
    const native = vi.fn(async () => true)
    sound.setAlarmBuzzer(native)
    sound.alertBuzz([200, 100, 200])
    await flush()
    expect(native).toHaveBeenCalledWith([200, 100, 200])
    expect(vib).toEqual([])
  })

  it('falls back to the ordinary buzz when the native one could not, or threw', async () => {
    sound.setAlarmBuzzer(async () => false)
    sound.alertBuzz([200])
    await flush()
    sound.setAlarmBuzzer(() => { throw new Error('bridge gone') })
    sound.alertBuzz([300])
    await flush()
    sound.setAlarmBuzzer(() => Promise.reject(new Error('no plugin')))
    sound.alertBuzz([400])
    await flush()
    expect(vib).toHaveLength(3)
  })

  it('Vibrate off is off for it too', async () => {
    const native = vi.fn(async () => true)
    sound.setAlarmBuzzer(native)
    sound.setVibrate(false)
    sound.alertBuzz([200, 100, 200])
    await flush()
    expect(native).not.toHaveBeenCalled()
    expect(vib).toEqual([])
  })
})
