#!/usr/bin/env node
// For every JS file in the main package, which packages actually load it. Walks the static import
// graph from each package's entry points: app.js, the custom tab bar, globally registered
// components and main pages for the main package; each subpackage's pages and the components
// their json files use. Prints main-package files the main package itself never loads, grouped by
// the subpackages that do (the "主包未使用的JS文件" of DevTools' code-quality scan).
// Run: node miniprogram/tools/pkg-deps.mjs [--json]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The mini program itself (this script lives in miniprogram-dev/tools, outside what ships).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../miniprogram')
const rel = p => path.relative(ROOT, p).split(path.sep).join('/')
const pkgOf = r => { const top = r.split('/')[0]; return /^(pkg|data)-/.test(top) || top === 'lib-shared' ? top : 'main' }
const read = r => fs.readFileSync(path.join(ROOT, r), 'utf8')

function importsOf(file) {
  const src = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const out = []
  for (const m of src.matchAll(/^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm)) {
    const spec = m[1] || m[2]
    const abs = spec.startsWith('/') ? path.join(ROOT, spec) : path.resolve(path.dirname(path.join(ROOT, file)), spec)
    if (fs.existsSync(abs)) out.push(rel(abs))
  }
  return out
}
function componentsOf(jsonRel) {
  if (!fs.existsSync(path.join(ROOT, jsonRel))) return []
  const j = JSON.parse(read(jsonRel))
  return Object.values(j.usingComponents || {}).map(p => {
    const abs = p.startsWith('/') ? path.join(ROOT, p) : path.resolve(path.dirname(path.join(ROOT, jsonRel)), p)
    return rel(abs)
  })
}
// Everything a set of entries reaches: page/component base paths ('pages/home/index') or js files.
function reach(entries) {
  const seen = new Set()
  const stack = [...entries]
  while (stack.length) {
    const e = stack.pop()
    if (e.endsWith('.js')) {
      if (seen.has(e)) continue
      seen.add(e)
      stack.push(...importsOf(e))
    } else {
      if (seen.has(e + '#')) continue
      seen.add(e + '#')
      if (fs.existsSync(path.join(ROOT, e + '.js'))) stack.push(e + '.js')
      stack.push(...componentsOf(e + '.json'))
    }
  }
  return new Set([...seen].filter(x => x.endsWith('.js')))
}

const app = JSON.parse(read('app.json'))
const used = {}
used.main = reach(['app.js', 'custom-tab-bar/index', ...app.pages, ...Object.values(app.usingComponents || {}).map(p => p.replace(/^\//, ''))])
for (const sp of app.subPackages) used[sp.root] = reach(sp.pages.map(p => sp.root + '/' + p))

const mainFiles = []
const walk = d => {
  for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
    const r = d ? d + '/' + e.name : e.name
    if (e.isDirectory()) { if (pkgOf(r) === 'main' && e.name !== 'tools') walk(r) }
    else if (r.endsWith('.js') && !/\.test\.js$|\.test-util\.js$/.test(r)) mainFiles.push(r)
  }
}
walk('')

const report = {}
for (const f of mainFiles) {
  if (used.main.has(f)) continue
  const by = Object.keys(used).filter(k => k !== 'main' && used[k].has(f)).sort()
  const key = by.length ? by.join(',') : '(nobody)'
  ;(report[key] ||= []).push(f)
}
if (process.argv.includes('--json')) { console.log(JSON.stringify(report, null, 2)); process.exit(0) }
const size = f => fs.statSync(path.join(ROOT, f)).size
let total = 0
for (const [k, fs_] of Object.entries(report).sort()) {
  const kb = fs_.reduce((n, f) => n + size(f), 0)
  total += kb
  console.log(`${k}  (${fs_.length} files, ${(kb / 1024).toFixed(0)} KB)`)
  for (const f of fs_.sort()) console.log('   ' + f)
}
console.log(`unused by main: ${(total / 1024).toFixed(0)} KB`)
