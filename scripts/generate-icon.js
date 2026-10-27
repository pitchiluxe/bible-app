#!/usr/bin/env node
/**
 * Bible App — Premium Icon Generator
 * Pure Node.js, zero external dependencies.
 * Sizes: 16, 24, 32, 48, 64, 128, 256 + 1024 PNG.
 *
 * Design: squircle (rounded-rect), warm deep-crimson leather cover,
 * glowing golden cross, gilded page-edge on right, red ribbon top,
 * subtle leather texture, gold inset border frame.
 */

const zlib = require('zlib')
const fs   = require('fs')
const path = require('path')

const lerp       = (a, b, t) => a + (b - a) * t
const clamp      = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const smoothstep = (lo, hi, x) => { const t = clamp((x - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t) }

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - ax, py - ay)
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1)
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}

// Signed distance to rounded rectangle (squircle)
// returns negative inside, positive outside
function sdfRoundedRect(px, py, halfW, halfH, r) {
  const qx = Math.abs(px) - halfW + r
  const qy = Math.abs(py) - halfH + r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

function drawPixel(x, y, size) {
  const half  = (size - 1) / 2
  const px    = x - half        // pixel coords, centered
  const py    = y - half

  // Squircle parameters — 18% corner radius, slight inset margin
  const margin = size * 0.025
  const hw     = half - margin
  const hh     = half - margin
  const r      = size * 0.18

  const sdf    = sdfRoundedRect(px, py, hw, hh, r)
  if (sdf > 0.8) return [0, 0, 0, 0]                   // fully outside
  const shapeAlpha = clamp(1 - (sdf + 0.5) / 1.0, 0, 1) // AA edge

  // Normalised coords inside [-1..1]
  const nx = px / hw
  const ny = py / hh
  const dn = Math.hypot(nx, ny)   // distance from centre (rough)

  // ── 1. Deep crimson leather background ───────────────────────────────────
  let r_ = 58, g = 7, b = 11

  // Warm inner radial glow
  const centLight = Math.pow(clamp(1 - Math.hypot(nx * 0.9, ny * 0.9), 0, 1), 1.6) * 0.50
  r_ = lerp(r_, 155, centLight)
  g  = lerp(g,  38,  centLight)
  b  = lerp(b,  20,  centLight)

  // Edge darkening
  const edgeDark = Math.pow(clamp((dn - 0.55) / 0.50, 0, 1), 1.2) * 0.65
  r_ = lerp(r_, 18, edgeDark)
  g  = lerp(g,  4,  edgeDark)
  b  = lerp(b,  5,  edgeDark)

  // Leather diagonal grain
  const grain = Math.sin((nx * 0.6 + ny * 1.0) * 20) * 0.035
  r_ = clamp(r_ + grain * r_, 0, 255)
  g  = clamp(g  + grain * g,  0, 255)

  // ── 2. Gilded page-edge stack (right side) ────────────────────────────────
  const pageX = 0.68          // left edge of page-stack zone (normalised)
  const inPage = nx >= pageX && ny >= -0.80 && ny <= 0.80
  if (inPage) {
    const t = ((nx - pageX) / (1.0 - pageX))           // 0→1 left→right
    // Alternating gilt-line shimmer
    const shimmer = Math.abs(Math.sin((ny + 1) * hw * 3.2)) * 0.5 + 0.5
    const pageBlend = smoothstep(0, 0.15, t) * 0.80 * shimmer
    r_ = lerp(r_, 235, pageBlend)
    g  = lerp(g,  210, pageBlend)
    b  = lerp(b,  145, pageBlend)
  }
  // Spine shadow at page edge
  const spineDist = Math.abs(nx - pageX) * hw
  if (nx >= pageX - 0.02 && spineDist < 2.2 && ny >= -0.80 && ny <= 0.80) {
    const sA = clamp(1 - spineDist / 2.2, 0, 1) * 0.45
    r_ = lerp(r_, 190, sA)
    g  = lerp(g,  155, sA)
    b  = lerp(b,  85,  sA)
  }

  // ── 3. Gold inset border frame ────────────────────────────────────────────
  const frameEdge   = 0.82    // how far in from centre the outer frame sits
  const frameThick  = 0.062   // normalised thickness
  const distL = frameEdge - Math.abs(nx)
  const distT = frameEdge - Math.abs(ny)
  // Only draw frame pixels that are inside the cover (not on the page zone)
  if (nx < pageX + 0.02) {
    const onFrameH = distL >= 0 && distL < frameThick
    const onFrameV = distT >= 0 && distT < frameThick
    if (onFrameH || onFrameV) {
      const d = Math.min(onFrameH ? distL : Infinity, onFrameV ? distT : Infinity)
      const fA = smoothstep(0, frameThick * 0.12, d) *
                 smoothstep(frameThick, frameThick * 0.15, d) * 0.88
      r_ = lerp(r_, 224, fA)
      g  = lerp(g,  182, fA)
      b  = lerp(b,  78,  fA)
    }
  }

  // ── 4. Red ribbon bookmark (hanging from top) ────────────────────────────
  const ribX = 0.10, ribW = 0.042
  const ribbonDist = Math.abs(nx - ribX)
  if (ribbonDist < ribW && ny >= -1.0 && ny <= -0.50) {
    const rA = smoothstep(ribW, ribW * 0.25, ribbonDist) * 0.95
    r_ = lerp(r_, 200, rA)
    g  = lerp(g,  18,  rA)
    b  = lerp(b,  18,  rA)
    const hilight = smoothstep(ribW * 0.3, 0, Math.abs(nx - (ribX - ribW * 0.18))) * 0.38
    r_ = lerp(r_, 255, hilight * rA)
    g  = lerp(g,  90,  hilight * rA)
    b  = lerp(b,  70,  hilight * rA)
  }

  // ── 5. Golden cross ───────────────────────────────────────────────────────
  const crossCY   = -0.05
  const vertTop   = -0.52, vertBot = 0.28
  const horizLeft = -0.28, horizRight = 0.28, horizY = -0.12
  const strokeW   = Math.max(0.072, 3.5 / hw)

  const dVert  = distToSeg(nx, ny, 0, vertTop, 0, vertBot)
  const dHoriz = distToSeg(nx, ny, horizLeft, horizY, horizRight, horizY)
  const dCross = Math.min(dVert, dHoriz)

  // Wide warm amber aura
  const aura1 = clamp(1 - dCross / (strokeW * 8), 0, 1)
  r_ = lerp(r_, 255, aura1 * 0.28)
  g  = lerp(g,  190, aura1 * 0.20)
  b  = lerp(b,  50,  aura1 * 0.10)

  // Tighter bright glow
  const aura2 = clamp(1 - dCross / (strokeW * 3.0), 0, 1)
  r_ = lerp(r_, 255, aura2 * 0.72)
  g  = lerp(g,  225, aura2 * 0.62)
  b  = lerp(b,  85,  aura2 * 0.42)

  // Cross fill — bright gold
  const fill = clamp(1 - dCross / strokeW, 0, 1)
  r_ = lerp(r_, 255, fill)
  g  = lerp(g,  232, fill)
  b  = lerp(b,  105, fill)

  // Intersection hotspot (near-white)
  const centerDist = Math.hypot(nx, ny - horizY) * hw
  const hot = clamp(1 - centerDist / (strokeW * hw * 2.0), 0, 1) * fill
  r_ = lerp(r_, 255, hot)
  g  = lerp(g,  255, hot)
  b  = lerp(b,  230, hot)

  // ── 6. Text rule lines below cross (gilt) ────────────────────────────────
  for (const [ry, rw] of [[0.40, 0.20], [0.48, 0.14]]) {
    const rH = 0.018
    if (Math.abs(ny - ry) < rH && Math.abs(nx) < rw) {
      const tA = smoothstep(rH, rH * 0.15, Math.abs(ny - ry)) *
                 smoothstep(rw, rw * 0.82, Math.abs(nx)) * 0.72
      r_ = lerp(r_, 220, tA)
      g  = lerp(g,  178, tA)
      b  = lerp(b,  75,  tA)
    }
  }

  // Drop-shadow along the bottom/right squircle edge for depth
  const shadowSdf = sdfRoundedRect(px - size * 0.012, py - size * 0.012, hw, hh, r)
  const shadowA   = clamp(smoothstep(-3, 3, shadowSdf) * 0.35, 0, 1)
  // (shadow is premultiplied into the background via the squircle alpha below)

  return [
    Math.round(clamp(r_, 0, 255)),
    Math.round(clamp(g,  0, 255)),
    Math.round(clamp(b,  0, 255)),
    Math.round(clamp(shapeAlpha * 255, 0, 255)),
  ]
}

// ── PNG encoder ──────────────────────────────────────────────────────────────

function buildPNG(size) {
  const T = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    T[i] = c
  }
  function crc32(buf) {
    let c = 0xFFFFFFFF
    for (const b of buf) c = T[(c ^ b) & 0xFF] ^ (c >>> 8)
    return (c ^ 0xFFFFFFFF) >>> 0
  }
  function chunk(type, data) {
    const tb = Buffer.from(type, 'ascii')
    const lb = Buffer.allocUnsafe(4); lb.writeUInt32BE(data.length, 0)
    const cb = Buffer.allocUnsafe(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0)
    return Buffer.concat([lb, tb, data, cb])
  }

  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.allocUnsafe(1 + size * 4)
    row[0] = 0
    for (let x = 0; x < size; x++) {
      const [pr, pg, pb, pa] = drawPixel(x, y, size)
      const i = 1 + x * 4
      row[i] = pr; row[i+1] = pg; row[i+2] = pb; row[i+3] = pa
    }
    rows.push(row)
  }
  const raw        = Buffer.concat(rows)
  const compressed = zlib.deflateSync(raw, { level: 7 })

  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ── ICO encoder ──────────────────────────────────────────────────────────────

function buildICO(entries) {
  const n = entries.length
  const hdr = Buffer.allocUnsafe(6)
  hdr.writeUInt16LE(0, 0); hdr.writeUInt16LE(1, 2); hdr.writeUInt16LE(n, 4)
  let offset = 6 + n * 16
  const dirs = entries.map(({ size, png }) => {
    const e = Buffer.allocUnsafe(16)
    e[0] = size >= 256 ? 0 : size; e[1] = size >= 256 ? 0 : size
    e[2] = 0; e[3] = 0
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6)
    e.writeUInt32LE(png.length, 8); e.writeUInt32LE(offset, 12)
    offset += png.length
    return e
  })
  return Buffer.concat([hdr, ...dirs, ...entries.map(e => e.png)])
}

// ── Main ─────────────────────────────────────────────────────────────────────

const SIZES = [16, 24, 32, 48, 64, 128, 256]
console.log('\nBible App — Premium Icon Generator (squircle edition)\n')

const entries = SIZES.map(size => {
  process.stdout.write(`  Rendering ${String(size).padStart(3)}×${size}... `)
  const png = buildPNG(size)
  process.stdout.write(`${png.length} bytes\n`)
  return { size, png }
})

const ico = buildICO(entries)
const outIco = path.join(__dirname, '..', 'resources', 'icon.ico')
fs.writeFileSync(outIco, ico)
console.log(`\n✓  ${outIco}  (${Math.ceil(ico.length / 1024)} KB)`)

process.stdout.write('  Rendering 1024×1024 PNG... ')
const bigPng = buildPNG(1024)
const outPng = path.join(__dirname, '..', 'resources', 'icon.png')
fs.writeFileSync(outPng, bigPng)
console.log(`${bigPng.length} bytes`)
console.log(`✓  ${outPng}  (${Math.ceil(bigPng.length / 1024)} KB)\n`)
