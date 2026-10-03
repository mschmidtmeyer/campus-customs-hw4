// Turns a catalogue photo into a transparent garment "cut-out" plus a few measurements
// (collar, shoulders, cuffs) so ModelFigure can dress an illustrated person in the REAL
// product photo. The catalogue mixes white, pure-black, letterboxed (black bars around a
// white box) and framed backgrounds, so mix-blend-mode alone would leave black boxes —
// instead we peel the background off with a flood fill from the image edges.
import { useEffect, useState } from 'react'

/** A point inside the cut-out image, as fractions (0..1) of its width / height. */
export interface FitPoint {
  x: number
  y: number
}

export interface GarmentFit {
  /** The URL this fit was made from (the product's image_url). */
  original: string
  /** Transparent, tightly cropped garment (object URL) — or the original photo on fallback. */
  src: string
  /** True when the background was removed; false means "blend the raw photo" (multiply). */
  cutout: boolean
  /** width / height of `src`. */
  aspect: number
  /** Where the neck enters the garment (collar centre, front neckline height). */
  neck: FitPoint
  /** Shoulder width as a fraction of the image width. */
  shoulder: number
  /** Lowest point of each sleeve [left, right]; null when unknown. */
  cuffs: [FitPoint, FitPoint] | null
  /** Sleeves reach the hem (hands at the cuffs) vs short sleeves (bare arms). */
  longSleeves: boolean
}

const MAX_SIDE = 480 // processing + output resolution (plenty for a ~300px-wide figure)

function fallbackFit(src: string, garmentType: string): GarmentFit {
  const short = /t-?shirt|tee\b/i.test(garmentType)
  return {
    original: src,
    src,
    cutout: false,
    aspect: 1,
    neck: { x: 0.5, y: 0.11 },
    shoulder: 0.62,
    cuffs: short
      ? [
          { x: 0.13, y: 0.34 },
          { x: 0.87, y: 0.34 },
        ]
      : [
          { x: 0.16, y: 0.92 },
          { x: 0.84, y: 0.92 },
        ],
    longSleeves: !short,
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    // /media is same-origin through the Vite proxy; ask for CORS only for foreign hosts.
    if (new URL(src, window.location.href).origin !== window.location.origin) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Could not load ${src}`))
    img.src = src
  })
}

function canvasToUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    // WebP keeps alpha and is small; browsers without WebP encoding fall back to PNG.
    canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('toBlob failed'))), 'image/webp', 0.9)
  })
}

const median = (values: Uint8Array) => values.slice().sort()[values.length >> 1]

/** Geometry of the garment inside the photo (pixels), plus its fit in the cropped image. */
export interface PixelAnalysis {
  left: number
  top: number
  width: number
  height: number
  aspect: number
  neck: FitPoint
  shoulder: number
  cuffs: [FitPoint, FitPoint] | null
  longSleeves: boolean
}

/**
 * Pure pixel pass (RGBA, row-major): makes the background transparent in place and
 * measures the garment. Returns null when no garment-sized shape is found.
 */
export function analyzePixels(px: Uint8ClampedArray | Uint8Array, w: number, h: number): PixelAnalysis | null {
  const N = w * h

  // 1. Background colour = per-channel median of the border; tolerance from its noise.
  const border: number[] = []
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x)
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1)
  const chan = (c: number) => median(Uint8Array.from(border, (i) => px[i * 4 + c]))
  const bgc: [number, number, number] = [chan(0), chan(1), chan(2)]
  const dist = (i: number, c: readonly number[]) =>
    Math.max(Math.abs(px[i * 4] - c[0]), Math.abs(px[i * 4 + 1] - c[1]), Math.abs(px[i * 4 + 2] - c[2]))
  const noise = border.map((i) => dist(i, bgc)).sort((a, b) => a - b)
  const tol = Math.min(30, Math.max(10, noise[Math.floor(noise.length * 0.6)] + 8))

  // 2. Flood fill the background from the edges (4-connected).
  const bg = new Uint8Array(N)
  const queue = new Int32Array(N)
  const flood = (seeds: Iterable<number>, color: readonly number[], t: number) => {
    let head = 0
    let tail = 0
    for (const i of seeds) {
      if (!bg[i] && dist(i, color) <= t) {
        bg[i] = 1
        queue[tail++] = i
      }
    }
    const visit = (j: number) => {
      if (!bg[j] && dist(j, color) <= t) {
        bg[j] = 1
        queue[tail++] = j
      }
    }
    while (head < tail) {
      const i = queue[head++]
      const x = i % w
      if (x > 0) visit(i - 1)
      if (x < w - 1) visit(i + 1)
      if (i >= w) visit(i - w)
      if (i < N - w) visit(i + w)
    }
  }
  flood(border, bgc, tol)

  // 3. Peel a second layer: a white box inside black bars / a thin frame, or dark vignette corners.
  const before = bg.slice()
  const WHITE = [255, 255, 255]
  const BLACK = [0, 0, 0]
  const peeled: number[][] = [bgc]
  if (Math.min(...bgc) < 200) {
    const seeds: number[] = [...border]
    for (let i = 0; i < N; i++) {
      if (bg[i]) continue
      const x = i % w
      if ((x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (i >= w && bg[i - w]) || (i < N - w && bg[i + w])) seeds.push(i)
    }
    flood(seeds, WHITE, 14)
    peeled.push(WHITE)
  }
  if (Math.max(...bgc) > 60) {
    flood(border, BLACK, 24)
    peeled.push(BLACK)
  }
  let fg = 0
  for (let i = 0; i < N; i++) if (!bg[i]) fg++
  if (fg < N * 0.1) bg.set(before) // the peel ate the garment (e.g. white tee on black): undo it

  // 4. Keep the garment: drop specks smaller than 15% of the biggest component.
  const label = new Int32Array(N)
  const sizes = [0]
  for (let s = 0; s < N; s++) {
    if (bg[s] || label[s]) continue
    const id = sizes.length
    let head = 0
    let tail = 0
    label[s] = id
    queue[tail++] = s
    while (head < tail) {
      const i = queue[head++]
      const x = i % w
      const near = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < N - w ? i + w : -1]
      for (const j of near) {
        if (j >= 0 && !bg[j] && !label[j]) {
          label[j] = id
          queue[tail++] = j
        }
      }
    }
    sizes.push(tail)
  }
  let biggest = 0
  for (const size of sizes) if (size > biggest) biggest = size
  if (biggest < N * 0.02) return null
  for (let i = 0; i < N; i++) if (!bg[i] && sizes[label[i]] < biggest * 0.15) bg[i] = 1

  // 5. Alpha (soft 1px edge) + bounding box (rows/cols with >= 2 garment pixels).
  const rows = new Int32Array(h)
  const cols = new Int32Array(w)
  for (let i = 0; i < N; i++) {
    const x = i % w
    if (bg[i]) {
      px[i * 4 + 3] = 0
      continue
    }
    rows[(i - x) / w]++
    cols[x]++
    const edge = (x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (i >= w && bg[i - w]) || (i < N - w && bg[i + w])
    if (edge) {
      const d = Math.min(...peeled.map((c) => dist(i, c)))
      px[i * 4 + 3] = Math.round(255 * Math.min(1, Math.max(0.25, (d - tol * 0.6) / (tol * 1.2))))
    }
  }
  let top = 0
  let bot = h - 1
  let left = 0
  let right = w - 1
  while (top < h - 1 && rows[top] < 2) top++
  while (bot > top && rows[bot] < 2) bot--
  while (left < w - 1 && cols[left] < 2) left++
  while (right > left && cols[right] < 2) right--
  const W = right - left + 1
  const H = bot - top + 1
  const isFg = (x: number, y: number) => !bg[y * w + x]
  const span = (y: number): [number, number] | null => {
    let a = -1
    let b = -1
    for (let x = left; x <= right; x++) {
      if (isFg(x, y)) {
        if (a < 0) a = x
        b = x
      }
    }
    return a < 0 ? null : [a, b]
  }

  // 6. Collar centre (top band), shoulder line (first row >= half the width), cuffs.
  const band = Math.max(2, Math.round(H * 0.03))
  let sumX = 0
  let n = 0
  for (let y = top; y < Math.min(bot + 1, top + band); y++) {
    for (let x = left; x <= right; x++) {
      if (isFg(x, y)) {
        sumX += x
        n++
      }
    }
  }
  const collarX = n ? sumX / n : left + W / 2
  let shoulderY = top
  for (let y = top; y <= bot; y++) {
    const s = span(y)
    if (s && s[1] - s[0] + 1 >= W * 0.5) {
      shoulderY = y
      break
    }
  }
  const neckY = shoulderY + H * 0.02
  const sRow = span(Math.min(bot, Math.round(shoulderY + H * 0.1)))
  const shoulderW = sRow ? sRow[1] - sRow[0] + 1 : W * 0.6
  const region = Math.max(2, Math.round(W * 0.2))
  const cuff = (x0: number, x1: number): FitPoint | null => {
    for (let y = bot; y >= top; y--) {
      let any = false
      for (let x = x0; x <= x1 && !any; x++) any = isFg(x, y)
      if (!any) continue
      let sx = 0
      let c = 0
      for (let yy = Math.max(top, y - 2); yy <= y; yy++) {
        for (let x = x0; x <= x1; x++) {
          if (isFg(x, yy)) {
            sx += x
            c++
          }
        }
      }
      return { x: (sx / c - left) / W, y: (y - top) / H }
    }
    return null
  }
  const cl = cuff(left, left + region)
  const cr = cuff(right - region, right)
  const cuffs: [FitPoint, FitPoint] | null = cl && cr ? [cl, cr] : null
  return {
    left,
    top,
    width: W,
    height: H,
    aspect: W / H,
    neck: { x: (collarX - left) / W, y: (neckY - top) / H },
    shoulder: Math.min(1, Math.max(0.3, shoulderW / W)),
    cuffs,
    longSleeves: !!cuffs && cuffs[0].y > 0.55 && cuffs[1].y > 0.55,
  }
}

async function buildFit(src: string): Promise<GarmentFit> {
  const img = await loadImage(src)
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(8, Math.round(img.naturalWidth * scale))
  const h = Math.max(8, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas unavailable')
  ctx.drawImage(img, 0, 0, w, h)
  const image = ctx.getImageData(0, 0, w, h) // throws on a tainted canvas -> fallback
  const a = analyzePixels(image.data, w, h)
  if (!a) throw new Error('No garment found')

  // Crop to the garment and export.
  const out = document.createElement('canvas')
  out.width = a.width
  out.height = a.height
  const octx = out.getContext('2d')
  if (!octx) throw new Error('2D canvas unavailable')
  octx.putImageData(image, -a.left, -a.top, a.left, a.top, a.width, a.height)
  return {
    original: src,
    src: await canvasToUrl(out),
    cutout: true,
    aspect: a.aspect,
    neck: a.neck,
    shoulder: a.shoulder,
    cuffs: a.cuffs,
    longSleeves: a.longSleeves,
  }
}

// ---------------------------------------------------------------------------
// Figure layout: 1 unit = 1cqw of the figure, which is 100 units wide, 200 tall.
// ---------------------------------------------------------------------------
export const FIGURE = {
  neckX: 50, // garment collar centre lands here…
  neckY: 41, // …just under the chin
  shoulder: 50, // garment shoulder width in units
  maxWidth: 98,
  maxHem: 132,
  ankle: 186,
} as const

export interface GarmentLayout {
  x: number
  y: number
  width: number
  height: number
  hem: number
  cuffs: FitPoint[] // in figure units
}

/** Scale the garment so its shoulders match the figure and its collar sits under the chin. */
export function garmentLayout(fit: Pick<GarmentFit, 'aspect' | 'neck' | 'shoulder' | 'cuffs'>): GarmentLayout {
  let gw = FIGURE.shoulder / fit.shoulder
  let gh = gw / fit.aspect
  const below = (1 - fit.neck.y) * gh
  const k = Math.min(1, FIGURE.maxWidth / gw, below > 0 ? (FIGURE.maxHem - FIGURE.neckY) / below : 1)
  gw *= k
  gh *= k
  const x = FIGURE.neckX - fit.neck.x * gw
  const y = FIGURE.neckY - fit.neck.y * gh
  return {
    x,
    y,
    width: gw,
    height: gh,
    hem: y + gh,
    cuffs: fit.cuffs ? fit.cuffs.map((p) => ({ x: x + p.x * gw, y: y + p.y * gh })) : [],
  }
}

const pending = new Map<string, Promise<GarmentFit>>()
const ready = new Map<string, GarmentFit>()

/** Cached per image URL; never rejects (falls back to the raw photo + default geometry). */
export function getGarmentFit(src: string, garmentType = ''): Promise<GarmentFit> {
  let job = pending.get(src)
  if (!job) {
    job = buildFit(src)
      .catch(() => fallbackFit(src, garmentType))
      .then((fit) => {
        ready.set(src, fit)
        return fit
      })
    pending.set(src, job)
  }
  return job
}

/** The garment fit for a product photo, or null while it is being prepared. */
export function useGarmentFit(src: string, garmentType = ''): GarmentFit | null {
  const [fit, setFit] = useState<GarmentFit | null>(() => ready.get(src) ?? null)
  useEffect(() => {
    let alive = true
    void getGarmentFit(src, garmentType).then((f) => {
      if (alive) setFit(f)
    })
    return () => {
      alive = false
    }
  }, [src, garmentType])
  const cached = ready.get(src)
  if (cached) return cached
  return fit && fit.original === src ? fit : null
}
