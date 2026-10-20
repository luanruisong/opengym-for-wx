#!/usr/bin/env node
// Static WXML checks: tags pair up, every wx:for has a wx:key, no method calls inside {{ }}
// (WXML expressions cannot call functions, except through a <wxs> module).
// Run: node miniprogram/tools/check-wxml.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// WXML has no void elements: every tag must be closed or self-closed (<input />).
const VOID = new Set()
const files = []
const walk = dir => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'tools') walk(rel) } else if (rel.endsWith('.wxml')) files.push(rel)
  }
}
walk('')
const problems = []
for (const f of files) {
  let src = fs.readFileSync(path.join(ROOT, f), 'utf8')
  // <wxs> bodies are JS; drop them, but remember the module names (calls into them are allowed).
  const wxsMods = new Set([...src.matchAll(/<wxs[^>]*\bmodule\s*=\s*"([^"]+)"/g)].map(m => m[1]))
  src = src.replace(/<wxs[\s\S]*?<\/wxs>/g, '').replace(/<!--[\s\S]*?-->/g, '')
  const stack = []
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/g
  let m
  while ((m = tagRe.exec(src))) {
    const [, close, name, attrs, self] = m
    const line = src.slice(0, m.index).split('\n').length
    if (close) {
      const top = stack.pop()
      if (!top || top.name !== name) problems.push(`${f}:${line} </${name}> closes ${top ? '<' + top.name + '> from line ' + top.line : 'nothing'}`)
      if (top && top.name !== name) stack.push(top)
      continue
    }
    if (/\bwx:for\s*=/.test(attrs) && !/\bwx:key\s*=/.test(attrs)) problems.push(`${f}:${line} <${name}> wx:for without wx:key`)
    for (const e of attrs.matchAll(/\{\{([\s\S]*?)\}\}/g)) checkExpr(e[1], f, line, wxsMods)
    if (!self && !VOID.has(name)) stack.push({ name, line })
  }
  for (const e of src.replace(/<[^>]*>/g, ' ').matchAll(/\{\{([\s\S]*?)\}\}/g)) checkExpr(e[1], f, '?', wxsMods)
  for (const s of stack) problems.push(`${f}:${s.line} <${s.name}> never closed`)
}
function checkExpr(expr, f, line, wxsMods) {
  // Strip string literals, then look for identifier( or .method( that is not a wxs module call.
  const bare = expr.replace(/'[^']*'|"[^"]*"/g, "''")
  for (const c of bare.matchAll(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g)) {
    const head = c[1].split('.')[0]
    if (!wxsMods.has(head)) problems.push(`${f}:${line} call in {{${expr.trim()}}}`)
  }
}
console.log(problems.length ? problems.join('\n') : 'wxml: ok')
console.log(files.length + ' wxml files checked')
process.exit(problems.length ? 1 : 0)
