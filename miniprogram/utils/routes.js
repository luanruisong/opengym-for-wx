// Maps the web app's hash routes (what lib code passes to nav()) onto mini program pages.
// Tab pages must be opened with wx.switchTab, which takes no query string.
export const TABS = {
  '/home': '/pages/home/index',
  '/plan': '/pages/plan/index',
  '/stats': '/pages/stats/index',
  '/library': '/pages/library/index',
}

const ROUTES = [
  [/^\/workout$/, () => '/pkg-workout/workout/index'],
  [/^\/plan\/r\/([^/?]+)$/, m => '/pkg-plan/routine/index?id=' + encodeURIComponent(m[1])],
  [/^\/history$/, () => '/pkg-history/history/index'],
  [/^\/structural-balance$/, () => '/pkg-history/structural-balance/index'],
  [/^\/muscles$/, () => '/pkg-history/muscles/index'],
  [/^\/checkin$/, () => '/pkg-body/checkin/index'],
  [/^\/measurements$/, () => '/pkg-body/measurements/index'],
  [/^\/progress-photos$/, () => '/pkg-body/progress-photos/index'],
  [/^\/settings$/, () => '/pkg-settings/settings/index'],
  [/^\/settings\/([^/?]+)$/, m => '/pkg-settings/page/index?page=' + encodeURIComponent(m[1])],
]

// '/stats?focus=x' → { url: '/pages/stats/index', tab: true, query: { focus: 'x' } }.
// Unknown routes (coach, admin…, which this build does not have) resolve to null.
export function resolveRoute(to) {
  const [path, qs = ''] = String(to || '').split('?')
  const query = {}
  qs.split('&').filter(Boolean).forEach(p => {
    const [k, v = ''] = p.split('=')
    query[decodeURIComponent(k)] = decodeURIComponent(v)
  })
  if (TABS[path]) return { url: TABS[path], tab: true, query }
  for (const [re, build] of ROUTES) {
    const m = path.match(re)
    if (m) {
      let url = build(m)
      if (qs) url += (url.includes('?') ? '&' : '?') + qs
      return { url, tab: false, query }
    }
  }
  return null
}
