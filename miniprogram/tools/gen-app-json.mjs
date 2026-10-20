#!/usr/bin/env node
// Writes miniprogram/app.json from the pages on disk: every <dir>/<name>/index.{js,json,wxml}
// triple is a page. pages/* is the main package (home first); every pkg-* / data-* folder is a
// subpackage. Run after adding or removing a page:  node miniprogram/tools/gen-app-json.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Folders under `base` that hold a page (index.js + index.json + index.wxml), as 'a/b/index'.
function pagesIn(base) {
  const out = []
  const walk = rel => {
    const dir = path.join(base, rel)
    const has = f => fs.existsSync(path.join(dir, f))
    if (rel && has('index.js') && has('index.json') && has('index.wxml')) {
      const json = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'))
      if (!json.component) out.push(rel.split(path.sep).join('/') + '/index')
    }
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && e.name !== 'components' && !e.name.startsWith('_')) walk(path.join(rel, e.name))
    }
  }
  walk('')
  return out.sort()
}

const TAB_ORDER = ['pages/home/index', 'pages/plan/index', 'pages/stats/index', 'pages/library/index']
const main = pagesIn(path.join(ROOT, 'pages')).map(p => 'pages/' + p)
const pages = [...TAB_ORDER.filter(p => main.includes(p)), ...main.filter(p => !TAB_ORDER.includes(p))]

const subPackages = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter(e => e.isDirectory() && /^(pkg|data)-/.test(e.name))
  .map(e => ({ root: e.name, pages: pagesIn(path.join(ROOT, e.name)) }))
  .filter(p => p.pages.length)

// Workout lives in a subpackage; fetch it (and the library) while the user is on Home.
const roots = new Set(subPackages.map(p => p.root))
const preloadRule = {}
for (const [page, pkgs] of Object.entries({
  'pages/home/index': ['pkg-workout', 'pkg-library'],
  'pages/plan/index': ['pkg-plan'],
  'pages/stats/index': ['pkg-history'],
})) {
  const have = pkgs.filter(p => roots.has(p))
  if (pages.includes(page) && have.length) preloadRule[page] = { network: 'all', packages: have }
}

const app = {
  pages,
  subPackages,
  preloadRule,
  window: {
    navigationBarTitleText: 'openGym',
    navigationBarBackgroundColor: '#000000',
    navigationBarTextStyle: 'white',
    backgroundColor: '#000000',
    backgroundTextStyle: 'light',
  },
  darkmode: true,
  tabBar: {
    custom: true,
    color: '#8e8e93',
    selectedColor: '#30d158',
    backgroundColor: '#0e0e10',
    list: [
      { pagePath: 'pages/home/index', text: '首页' },
      { pagePath: 'pages/plan/index', text: '计划' },
      { pagePath: 'pages/stats/index', text: '统计' },
      { pagePath: 'pages/library/index', text: '动作库' },
    ],
  },
  usingComponents: {
    'icon-x': '/components/icon/index',
    'toast-x': '/components/toast/index',
    'rest-timer': '/components/rest-timer/index',
    'timer-flash': '/components/timer-flash/index',
    row: '/components/row/index',
    seg: '/components/seg/index',
    'switch-x': '/components/switch-x/index',
    stepper: '/components/stepper/index',
    'num-field': '/components/num-field/index',
    empty: '/components/empty/index',
    sheet: '/components/sheet/index',
  },
  lazyCodeLoading: 'requiredComponents',
  style: 'v2',
  sitemapLocation: 'sitemap.json',
}

fs.writeFileSync(path.join(ROOT, 'app.json'), JSON.stringify(app, null, 2) + '\n')
if (!fs.existsSync(path.join(ROOT, 'sitemap.json'))) {
  fs.writeFileSync(path.join(ROOT, 'sitemap.json'), JSON.stringify({ rules: [{ action: 'allow', page: '*' }] }, null, 2) + '\n')
}
console.log(`app.json: ${pages.length} main pages, ${subPackages.length} subpackages, ` +
  `${subPackages.reduce((n, p) => n + p.pages.length, 0)} subpackage pages`)
