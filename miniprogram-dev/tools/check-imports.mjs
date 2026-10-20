#!/usr/bin/env node
// Static checks WeChat's compiler would otherwise only report one at a time:
//   · every relative import resolves to a file;
//   · no bare specifiers (no npm packages in this build);
//   · no import across packages: the main package may not import a subpackage, and a subpackage
//     may import only itself and the main package (data-* are loaded with require.async instead);
//   · every usingComponents path exists, under the same package rule.
// Run: node miniprogram/tools/check-imports.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The mini program itself (this script lives in miniprogram-dev/tools, outside what ships).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../miniprogram')
const skip = p => /\.test\.js$|\.test-util\.js$|\.mjs$/.test(p) || p.startsWith('tools' + path.sep)
const files = []
const walk = dir => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) walk(rel)
    else if (!skip(rel)) files.push(rel)
  }
}
walk('')
// lib-shared/ is not uploaded: it counts as a package of its own that nothing may import (the
// subpackages import generated copies of it, tools/sync-shared.mjs).
const pkgOf = rel => { const top = rel.split(path.sep)[0]; return /^(pkg|data)-/.test(top) || top === 'lib-shared' ? top : 'main' }
const problems = []
const target = (from, spec) => (spec.startsWith('/') ? path.join(spec.slice(1)) : path.join(path.dirname(from), spec))

for (const f of files.filter(f => f.endsWith('.js'))) {
  // Comments out first: prose that reads "import … from '…'" is not an import.
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const specs = [...src.matchAll(/^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm)].map(m => m[1] || m[2])
  for (const spec of specs) {
    if (!spec.startsWith('.') && !spec.startsWith('/')) { problems.push(`BARE    ${f}: '${spec}'`); continue }
    const t = target(f, spec)
    if (!fs.existsSync(path.join(ROOT, t))) { problems.push(`MISSING ${f}: '${spec}'`); continue }
    const a = pkgOf(f), b = pkgOf(t)
    if (b !== 'main' && b !== a) problems.push(`CROSS   ${f} (${a}) imports ${t} (${b})`)
  }
}
for (const f of files.filter(f => f.endsWith('.json'))) {
  let j
  try { j = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')) } catch (e) { problems.push(`JSON    ${f}: ${e.message}`); continue }
  for (const [name, p] of Object.entries(j.usingComponents || {})) {
    if (p.startsWith('plugin://')) continue
    const t = target(f, p)
    if (!fs.existsSync(path.join(ROOT, t + '.js'))) { problems.push(`COMP    ${f}: ${name} → ${p} (missing)`); continue }
    const a = f === 'app.json' ? 'main' : pkgOf(f), b = pkgOf(t)
    if (b !== 'main' && b !== a) problems.push(`CROSS   ${f} (${a}) uses component ${t} (${b})`)
  }
}
console.log(problems.length ? problems.join('\n') : 'imports and components: ok')
console.log(`${files.filter(f => f.endsWith('.js')).length} js, ${files.filter(f => f.endsWith('.json')).length} json checked`)
process.exit(problems.length ? 1 : 0)
