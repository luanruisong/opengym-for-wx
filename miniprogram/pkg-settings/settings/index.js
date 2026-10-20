// Settings root (frontend/src/views/Settings.jsx SettingsRoot): a search over every row, then the
// pages in four groups, each row with a preview of its main value. A hit opens its page with the
// row's id, which the page scrolls to and flashes. The query stays while you step into a hit
// and back (this page stays on the stack); opened afresh it starts empty.
import { connectPage } from '../../utils/page.js'
import { navTo } from '../../utils/nav.js'
import { useStore } from '../../store/store.js'
import { t, tn } from '../../lib/i18n.js'
import { fmtRest } from '../../lib/duration.js'
import { weekdayShort, weekStartOf, SUNDAY, ACCENT_NAMES } from '../../lib/format.js'
import { scheduleModeOf } from '../../lib/rotation.js'
import { vibrateSupported, playOnSilentSupported } from '../../lib/sound.js'
import { referencedFiles } from '../../lib/media-refs.js'
import { accentKey, CUSTOM } from '../../lib/accent.js'
import { PAGES, ROOT_GROUPS, pageVisible, pageTitle, searchSettings, APP_VERSION } from '../settings-pages.js'

export function accentLabel(S) {
  const k = accentKey(S)
  return k === CUSTOM ? t('Your own color') : t(ACCENT_NAMES[k] || 'Green')
}

// What the pages and the search need to know about this device and profile.
export function searchCtx(S) {
  return {
    sound: !!S.sound,
    playOnSilent: playOnSilentSupported(),
    canVibrate: vibrateSupported(),
    vibrate: S.vibrate !== false,
    profiles: (S.equipProfiles || []).length > 0,
    hasMedia: referencedFiles(S).length > 0,
  }
}

function previews(S) {
  const canVibrate = vibrateSupported()
  const layout = ['list', 'compact'].includes(S.workoutView) ? S.workoutView : 'cards'
  const layoutLabel = { cards: t('Cards'), list: t('List'), compact: t('Compact') }[layout]
  const activeProfile = (S.equipProfiles || []).find(p => p.id === S.activeEquipId)
  const themeLabel = { dark: t('Dark'), light: t('Light'), system: t('System') }[S.theme || 'dark'] || t('Dark')
  const mode = scheduleModeOf(S)
  return {
    workout: (S.restSec > 0 ? t('{0} rest', fmtRest(S.restSec)) : t('No rest timer')) + ' · ' + layoutLabel,
    alerts: [S.sound ? t('Sound') : null, canVibrate && S.vibrate !== false ? t('Vibrate') : null, S.timerFlash ? t('Flash') : null].filter(Boolean).join(' · ') || t('Silent'),
    plan: (mode === 'rotation' ? t('Rotation') : t('Fixed Week')) + ' · ' + weekdayShort(weekStartOf(S) === SUNDAY ? 0 : 1),
    units: S.unit || 'kg',
    equipment: S.equipFilterOn && activeProfile ? activeProfile.name : t('Everything'),
    look: themeLabel + ' · ' + accentLabel(S),
    data: '',
    about: 'v' + APP_VERSION,
  }
}

Page(connectPage({
  data: { q: '', searching: false, hits: [], hitsTitle: '', emptyText: '', groups: [], versionLine: '' },

  mapState(S) {
    const pv = previews(S)
    const groups = ROOT_GROUPS.map(g => g.filter(id => pageVisible(id))).filter(g => g.length).map(g => ({
      key: g[0],
      rows: g.map(id => ({ id, title: pageTitle(id), icon: PAGES[id].icon, tint: PAGES[id].tint, value: pv[id] || '' })),
    }))
    return Object.assign({ groups, versionLine: 'openGym v' + APP_VERSION }, this.searchData(S, this.data.q))
  },

  // The hits for `q`, as page data. `this.hitList` keeps the full entries for the tap.
  searchData(S, q) {
    const query = String(q || '')
    if (!query.trim()) { this.hitList = []; return { searching: false, hits: [], hitsTitle: '', emptyText: '' } }
    const list = searchSettings(query, searchCtx(S)).slice(0, 40)
    this.hitList = list
    return {
      searching: true,
      hits: list.map(h => ({ key: h.page + ':' + h.id, label: h.label, trail: h.trail, icon: h.icon, tint: h.tint })),
      hitsTitle: tn('{0} result', '{0} results', list.length),
      emptyText: t('No setting matches “{0}”.', query.trim()),
    }
  },

  setQuery(q) {
    this.setData(Object.assign({ q }, this.searchData(useStore.getState().S, q)))
  },

  onQ(e) { this.setQuery(e.detail.value) },
  onClear() { this.setQuery('') },

  onOpen(e) {
    const id = e.currentTarget.dataset.id
    if (id) navTo('/settings/' + id)
  },

  onHit(e) {
    const h = (this.hitList || [])[+e.currentTarget.dataset.i]
    if (!h) return
    navTo('/settings/' + h.page + (h.isPage ? '' : '?find=' + encodeURIComponent(h.id)))
  },
}))
