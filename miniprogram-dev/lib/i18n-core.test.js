import { describe, it, expect } from 'vitest'
import {
  LANGS, INSTR_LANGS, EXERCISE_NAME_LANGS, DATE_LOCALES, DERIVED_LOCALES,
  baseLang, derivePack, dateLocale, getLang, t, _setLangState, exerciseNameClass, exerciseNameFor, CASED_NAME_LANGS
} from '../../miniprogram/lib/i18n-core.js'
import { EXDB } from '../../miniprogram/data-ex/exercises-data.js'

describe('baseLang', () => {
  it('maps a derived locale to the language whose packs it loads', () => {
    expect(baseLang('de-CH')).toBe('de')
  })

  it('leaves every other language as itself', () => {
    expect(baseLang('de')).toBe('de')
    expect(baseLang('pt-BR')).toBe('pt-BR')
    expect(baseLang('en')).toBe('en')
    expect(baseLang('nonsense')).toBe('nonsense')
  })

})

describe('derivePack', () => {
  it('rewrites ß as ss for Swiss German', () => {
    expect(derivePack('de-CH', { a: 'Gesäß', b: 'Füße', c: 'schließen' }))
      .toEqual({ a: 'Gesäss', b: 'Füsse', c: 'schliessen' })
  })

  it('leaves legitimate ss alone', () => {
    expect(derivePack('de-CH', { a: 'Arbeitssätze', b: 'Schlüssel', c: 'Latissimus' }))
      .toEqual({ a: 'Arbeitssätze', b: 'Schlüssel', c: 'Latissimus' })
  })

  it('walks instruction packs, which nest steps in arrays', () => {
    expect(derivePack('de-CH', { '0007': ['Setz dich aufs Gerät.', 'Spann das Gesäß an.'] }))
      .toEqual({ '0007': ['Setz dich aufs Gerät.', 'Spann das Gesäss an.'] })
  })

  it('returns the pack untouched for a language that is not derived', () => {
    const pack = { a: 'Gesäß' }
    expect(derivePack('de', pack)).toBe(pack)
    expect(derivePack('en', pack)).toBe(pack)
  })

  it('passes a null pack through', () => {
    expect(derivePack('de-CH', null)).toBe(null)
  })

})

describe('de-CH as a selectable language', () => {



  it('declares de as its base, not the other way round', () => {
    // ss → ß is not mechanical (Maße and Masse both collapse to Masse), so the German pack
    // must never be generated from the Swiss one.
    expect(DERIVED_LOCALES['de-CH'].base).toBe('de')
    expect(DERIVED_LOCALES.de).toBeUndefined()
  })
})

// EXDB stores English names lower-case and the UI title-cases them with CSS. German brings its
// own casing, and applying capitalize on top of it produced "Bankdrücken Mit Langhantel". The
// other packs are stored lower-case like EXDB, and without the class they read all lower-case.
describe('exerciseNameClass', () => {
  const bench = { id: '0025', n: 'barbell bench press' }
  const pushUp = { id: '0662', n: 'push-up' }
  const custom = { id: 'custom-1', n: 'my own press' }

  it('title-cases only while the English fallback is showing', () => {
    _setLangState('en', {}, null, null)
    expect(exerciseNameClass(bench)).toBe('capitalize')
    _setLangState('de', {}, null, null)
    expect(exerciseNameClass(bench)).toBe('capitalize')
    _setLangState('de', {}, null, { '0025': 'Bankdrücken mit Langhantel' })
    expect(exerciseNameClass(bench)).toBe('')
    _setLangState('en', {}, null, null)
    expect(exerciseNameClass(bench)).toBe('capitalize')
  })

  // German covers the equipment exercises and not the body-weight ones: an exercise the pack
  // has no entry for shows its lower-case English title and still needs the casing.
  it('decides per exercise, so an untranslated one in a partial pack keeps its casing', () => {
    _setLangState('de', {}, null, { '0025': 'Bankdrücken mit Langhantel' })
    expect(exerciseNameClass(bench)).toBe('')
    expect(exerciseNameClass(pushUp)).toBe('capitalize')
    expect(exerciseNameClass(custom)).toBe('capitalize')
    expect(exerciseNameClass(undefined)).toBe('capitalize')
    _setLangState('en', {}, null, null)
  })
})

// #290 took the title-casing off every translated name so German would keep its own, and the
// packs stored lower-case (pt-BR, hu, es, ru, it, fr) went lower-case everywhere with it. Which
// packs carry real casing is a list, so it is checked against what the packs actually hold: a
// new pack that is lower-case gets the casing without anyone remembering to add it, and one with
// real casing fails here until it is listed.

// The two per-language switches in Settings (the English name in parentheses, English names
// only) came with the Italian and French packs, but they have to hold for every pack the app
// ships — German too, which covers only part of the catalogue.
