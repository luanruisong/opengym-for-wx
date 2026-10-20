// SVG path data → canvas drawing commands and hit-test polygons, for the body map.
//
// Neither Path2D strings nor isPointInPath are reliable across mini program base libraries
// (Canvas.createPath2D takes another Path2D, not an SVG string, on several versions), so the
// path data is parsed here once: every command becomes absolute M / L / C / Z (arcs and
// quadratics turn into cubics), which any canvas can draw, and each subpath is also flattened
// into a polygon for a nonzero-winding point test in viewBox units.

const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y

function tokenize(d) {
  const out = []
  let i = 0
  const n = d.length
  while (i < n) {
    const ch = d[i]
    if (/[a-zA-Z]/.test(ch)) { out.push(ch); i++; continue }
    if (ch === ' ' || ch === ',' || ch === '\n' || ch === '\t' || ch === '\r') { i++; continue }
    NUM.lastIndex = i
    const m = NUM.exec(d)
    if (!m) { i++; continue }
    out.push(m[0])
    i = NUM.lastIndex
  }
  return out
}

// Arc flags may be written packed ("a5 5 0 011 2"): read them one character at a time.
function splitFlags(tokens) {
  const out = []
  let cmd = ''
  let argi = 0
  for (const tk of tokens) {
    if (/^[a-zA-Z]$/.test(tk)) { cmd = tk; argi = 0; out.push(tk); continue }
    if (cmd === 'a' || cmd === 'A') {
      let s = tk
      while (s.length) {
        const k = argi % 7
        if ((k === 3 || k === 4) && (s[0] === '0' || s[0] === '1')) {
          out.push(s[0]); s = s.slice(1); argi++
          continue
        }
        NUM.lastIndex = 0
        const m = NUM.exec(s)
        if (!m) break
        out.push(m[0]); s = s.slice(m[0].length); argi++
      }
    } else { out.push(tk); argi++ }
  }
  return out
}

// One SVG arc as cubic segments (absolute coordinates). Standard endpoint → centre conversion.
function arcToCubics(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
  const out = []
  if (x1 === x2 && y1 === y2) return out
  rx = Math.abs(rx); ry = Math.abs(ry)
  if (!rx || !ry) { out.push([x1, y1, x2, y2, x2, y2]); return out }
  const rad = phi * Math.PI / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2
  const xp = cos * dx + sin * dy, yp = -sin * dx + cos * dy
  let lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry)
  if (lam > 1) { lam = Math.sqrt(lam); rx *= lam; ry *= lam }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp
  const den = rx * rx * yp * yp + ry * ry * xp * xp
  let co = Math.sqrt(Math.max(0, num / den))
  if (fa === fs) co = -co
  const cxp = co * rx * yp / ry, cyp = -co * ry * xp / rx
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2
  const ang = (ux, uy, vx, vy) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    return a
  }
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry)
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry)
  if (!fs && dt > 0) dt -= 2 * Math.PI
  else if (fs && dt < 0) dt += 2 * Math.PI
  const segs = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)))
  const step = dt / segs
  const k = 4 / 3 * Math.tan(step / 4)
  let t = t1
  const pt = (a) => {
    const ex = rx * Math.cos(a), ey = ry * Math.sin(a)
    return [cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]
  }
  const dv = (a) => {
    const ex = -rx * Math.sin(a), ey = ry * Math.cos(a)
    return [cos * ex - sin * ey, sin * ex + cos * ey]
  }
  for (let i = 0; i < segs; i++) {
    const a1 = t, a2 = t + step
    const p1 = pt(a1), p2 = pt(a2), d1 = dv(a1), d2 = dv(a2)
    out.push([p1[0] + k * d1[0], p1[1] + k * d1[1], p2[0] - k * d2[0], p2[1] - k * d2[1], p2[0], p2[1]])
    t = a2
  }
  return out
}

/** Parses SVG path data into absolute commands: ['M',x,y] ['L',x,y] ['C',x1,y1,x2,y2,x,y] ['Z']. */
export function parsePath(d) {
  const tk = splitFlags(tokenize(d))
  const cmds = []
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0
  let lcx = null, lcy = null, lqx = null, lqy = null   // last control points for S / T
  const num = () => parseFloat(tk[i++])
  const isNum = () => i < tk.length && !/^[a-zA-Z]$/.test(tk[i])
  while (i < tk.length) {
    if (/^[a-zA-Z]$/.test(tk[i])) cmd = tk[i++]
    else if (!cmd) { i++; continue }
    const rel = cmd === cmd.toLowerCase()
    const C = cmd.toUpperCase()
    if (C === 'Z') {
      cmds.push(['Z']); x = sx; y = sy; lcx = lqx = null
      continue
    }
    if (!isNum()) continue
    do {
      if (C === 'M') {
        let nx = num(), ny = num(); if (rel) { nx += x; ny += y }
        cmds.push(['M', nx, ny]); x = sx = nx; y = sy = ny
        cmd = rel ? 'l' : 'L'
        lcx = lqx = null
        break
      } else if (C === 'L') {
        let nx = num(), ny = num(); if (rel) { nx += x; ny += y }
        cmds.push(['L', nx, ny]); x = nx; y = ny; lcx = lqx = null
      } else if (C === 'H') {
        let nx = num(); if (rel) nx += x
        cmds.push(['L', nx, y]); x = nx; lcx = lqx = null
      } else if (C === 'V') {
        let ny = num(); if (rel) ny += y
        cmds.push(['L', x, ny]); y = ny; lcx = lqx = null
      } else if (C === 'C') {
        let a = num(), b = num(), c = num(), e = num(), f = num(), g = num()
        if (rel) { a += x; b += y; c += x; e += y; f += x; g += y }
        cmds.push(['C', a, b, c, e, f, g]); lcx = c; lcy = e; lqx = null; x = f; y = g
      } else if (C === 'S') {
        let c = num(), e = num(), f = num(), g = num()
        if (rel) { c += x; e += y; f += x; g += y }
        const a = lcx == null ? x : 2 * x - lcx, b = lcx == null ? y : 2 * y - lcy
        cmds.push(['C', a, b, c, e, f, g]); lcx = c; lcy = e; lqx = null; x = f; y = g
      } else if (C === 'Q' || C === 'T') {
        let qx, qy
        if (C === 'Q') { qx = num(); qy = num(); if (rel) { qx += x; qy += y } }
        else { qx = lqx == null ? x : 2 * x - lqx; qy = lqx == null ? y : 2 * y - lqy }
        let f = num(), g = num(); if (rel) { f += x; g += y }
        cmds.push(['C', x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y), f + 2 / 3 * (qx - f), g + 2 / 3 * (qy - g), f, g])
        lqx = qx; lqy = qy; lcx = null; x = f; y = g
      } else if (C === 'A') {
        const rx = num(), ry = num(), phi = num(), fa = num(), fs = num()
        let f = num(), g = num(); if (rel) { f += x; g += y }
        for (const s of arcToCubics(x, y, rx, ry, phi, !!fa, !!fs, f, g)) cmds.push(['C', ...s])
        x = f; y = g; lcx = lqx = null
      } else { i++; break }
    } while (isNum())
  }
  return cmds
}

/** Flattens commands into closed polygons (flat [x0,y0,x1,y1,…] arrays), one per subpath. */
export function flatten(cmds, steps = 8) {
  const polys = []
  let cur = null, x = 0, y = 0
  for (const c of cmds) {
    if (c[0] === 'M') { if (cur && cur.length > 4) polys.push(cur); cur = [c[1], c[2]]; x = c[1]; y = c[2] }
    else if (c[0] === 'L') { (cur = cur || [x, y]).push(c[1], c[2]); x = c[1]; y = c[2] }
    else if (c[0] === 'C') {
      cur = cur || [x, y]
      for (let s = 1; s <= steps; s++) {
        const t = s / steps, u = 1 - t
        const a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t
        cur.push(a * x + b * c[1] + d * c[3] + e * c[5], a * y + b * c[2] + d * c[4] + e * c[6])
      }
      x = c[5]; y = c[6]
    } else if (c[0] === 'Z') { if (cur && cur.length > 4) polys.push(cur); cur = null }
  }
  if (cur && cur.length > 4) polys.push(cur)
  return polys
}

/** Nonzero winding test over all of a part's polygons (the canvas/SVG default fill rule). */
export function hit(polys, px, py) {
  let w = 0
  for (const p of polys) {
    const n = p.length
    for (let i = 0; i < n; i += 2) {
      const x1 = p[i], y1 = p[i + 1]
      const j = (i + 2) % n
      const x2 = p[j], y2 = p[j + 1]
      if (y1 <= py) {
        if (y2 > py && (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1) > 0) w++
      } else if (y2 <= py && (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1) < 0) w--
    }
  }
  return w !== 0
}

/** Replays commands on a canvas 2D context (caller does beginPath / fill / stroke). */
export function trace(ctx, cmds) {
  for (const c of cmds) {
    if (c[0] === 'M') ctx.moveTo(c[1], c[2])
    else if (c[0] === 'L') ctx.lineTo(c[1], c[2])
    else if (c[0] === 'C') ctx.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6])
    else ctx.closePath()
  }
}
