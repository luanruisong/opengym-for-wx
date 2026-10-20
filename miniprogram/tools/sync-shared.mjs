#!/usr/bin/env node
// lib-shared/ holds the few modules that several subpackages use but the main package does not
// (photo intake, media limits, clipboard, zip, exercise history). WeChat's code-quality scan
// wants such JS out of the main package, and a subpackage cannot import another subpackage, so
// each subpackage that needs one gets its own generated copy in <pkg>/lib/. lib-shared/ is the only
// place to edit (and where their tests live); it is excluded from the upload (project.config.json).
//
// What this does:
//   · every import in a subpackage that points at lib-shared/x.js, or at an existing copy
//     <pkg>/lib/x.js, is pointed at the subpackage's own copy;
//   · copies are (re)generated for exactly the shared modules each subpackage reaches, including
//     shared modules those import, with their imports of main-package lib/ re-pointed;
//   · stale copies (a subpackage that stopped using a module) are removed.
// `--check` changes nothing and exits 1 if any copy or import is out of date.
// Run: node miniprogram/tools/sync-shared.mjs [--check]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHARED = path.join(ROOT, 'lib-shared')
const CHECK = process.argv.includes('--check')
const HEADER = '// GENERATED from lib-shared/{name} by tools/sync-shared.mjs. Edit lib-shared/{name}, then rerun.\n'
const names = new Set(fs.readdirSync(SHARED).filter(f => f.endsWith('.js') && !f.endsWith('.test.js')))
const pkgs = fs.readdirSync(ROOT).filter(d => /^pkg-/.test(d) && fs.statSync(path.join(ROOT, d)).isDirectory())
const SPEC = /(['"])(\.{1,2}\/[^'"\n]+?\.js)\1/g
const isCopy = f => fs.readFileSync(f, 'utf8').startsWith('// GENERATED from lib-shared/')

const jsIn = dir => {
  const out = []
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) out.push(p) } }
  walk(dir)
  return out
}
const relSpec = (fromDir, to) => { let r = path.relative(fromDir, to).split(path.sep).join('/'); return r.startsWith('.') ? r : './' + r }

let stale = 0
const write = (file, content) => {
  const now = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
  if (now === content) return
  stale++
  if (CHECK) { console.log('out of date: ' + path.relative(ROOT, file)); return }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

// Shared modules a shared module imports (transitively), by file name.
const sharedDeps = name => {
  const src = fs.readFileSync(path.join(SHARED, name), 'utf8')
  return [...src.matchAll(SPEC)].map(m => path.resolve(SHARED, m[2])).filter(p => path.dirname(p) === SHARED && names.has(path.basename(p))).map(p => path.basename(p))
}
const closure = start => { const seen = new Set(); const st = [...start]; while (st.length) { const n = st.pop(); if (seen.has(n)) continue; seen.add(n); st.push(...sharedDeps(n)) } return seen }

for (const pkg of pkgs) {
  const libDir = path.join(ROOT, pkg, 'lib')
  const copyOf = name => path.join(libDir, name)
  const need = new Set()
  // 1. Re-point the subpackage's own files (not the generated copies) at its copies.
  for (const f of jsIn(path.join(ROOT, pkg))) {
    if (f.endsWith('.test.js') || (path.dirname(f) === libDir && names.has(path.basename(f)) && fs.existsSync(f) && isCopy(f))) continue
    const src = fs.readFileSync(f, 'utf8')
    const out = src.replace(SPEC, (all, q, spec) => {
      const target = path.resolve(path.dirname(f), spec)
      const base = path.basename(target)
      const shared = path.dirname(target) === SHARED || (path.dirname(target) === libDir && names.has(base))
      if (!shared || !names.has(base)) return all
      need.add(base)
      return q + relSpec(path.dirname(f), copyOf(base)) + q
    })
    if (out !== src) write(f, out)
  }
  // 2. Generate the copies (with the shared modules they pull in) and drop the ones no longer used.
  const want = closure(need)
  for (const name of want) {
    const src = fs.readFileSync(path.join(SHARED, name), 'utf8').replace(SPEC, (all, q, spec) => {
      const target = path.resolve(SHARED, spec)
      if (path.dirname(target) === SHARED && names.has(path.basename(target))) return q + './' + path.basename(target) + q
      return q + relSpec(libDir, target) + q
    })
    write(copyOf(name), HEADER.replaceAll('{name}', name) + src)
  }
  if (fs.existsSync(libDir)) {
    for (const f of fs.readdirSync(libDir)) {
      const p = path.join(libDir, f)
      if (names.has(f) && !want.has(f) && isCopy(p)) { stale++; if (CHECK) console.log('unused copy: ' + path.relative(ROOT, p)); else fs.unlinkSync(p) }
    }
  }
  if (want.size) console.log(`${pkg}: ${[...want].sort().join(', ')}`)
}
// The main package must not import lib-shared (it is not uploaded).
for (const f of jsIn(ROOT).filter(f => !/^(pkg-|data-|tools$|lib-shared$|node_modules$)/.test(path.relative(ROOT, f).split(path.sep)[0]) && !f.endsWith(".test.js"))) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(SPEC)) {
    if (path.dirname(path.resolve(path.dirname(f), m[2])) === SHARED) { stale++; console.log('main package imports lib-shared: ' + path.relative(ROOT, f)) }
  }
}
if (CHECK && stale) { console.log(`${stale} out of date: run node miniprogram/tools/sync-shared.mjs`); process.exit(1) }
console.log(CHECK ? 'shared copies: up to date' : `shared copies: ${stale} file(s) written or removed`)
