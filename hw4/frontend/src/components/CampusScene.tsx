import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import type { CampusPhoto, Season } from '../season/seasonContext'
import { SEASON_COPY } from '../season/seasonCopy'
import { MAPLE_LEAF_PATH } from './SeasonIcon'
import './CampusScene.css'

/*
 * An original, illustrated Yale campus for each season (no photos, no image assets):
 * a Gothic skyline with Harkness Tower, a collegiate-Gothic gate, halls, elms and lamp
 * posts, drawn as five stacked SVG layers that share one viewBox. Colors come from CSS
 * variables per season (CampusScene.css). Motion is CSS-only (particles + clouds) plus a
 * rAF scroll parallax that only writes `translate` on the layers. With a `photo`, the real
 * photo takes the frame (see PhotoArt) and the illustration stays as a faint navy layer
 * behind it, plus the season's particles on top.
 */

const W = 1920
const H = 900
const GROUND = 812

// ---------------------------------------------------------------------------
// Geometry helpers (all subpaths wind clockwise, so overlaps simply union)
// ---------------------------------------------------------------------------

const f = (n: number) => Math.round(n * 10) / 10
const rect = (x: number, y: number, w: number, h: number) => `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`
const spike = (x: number, base: number, w: number, h: number) =>
  `M${f(x)} ${f(base)}L${f(x + w / 2)} ${f(base - h)}L${f(x + w)} ${f(base)}Z`
const gable = (x1: number, x2: number, eave: number, peak: number, bottom = GROUND) =>
  `M${x1} ${bottom}V${eave}L${f((x1 + x2) / 2)} ${peak}L${x2} ${eave}V${bottom}Z`
const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  `M${f(cx - rx)} ${f(cy)}a${f(rx)} ${f(ry)} 0 1 1 ${f(2 * rx)} 0a${f(rx)} ${f(ry)} 0 1 1 ${f(-2 * rx)} 0Z`

/** Pointed (Gothic) arch: x, y = top-left of its bounding box. */
function lancet(x: number, y: number, w: number, h: number): string {
  const r = w / 2
  return `M${f(x)} ${f(y + h)}V${f(y + r)}Q${f(x)} ${f(y + r * 0.25)} ${f(x + r)} ${f(y)}Q${f(x + w)} ${f(y + r * 0.25)} ${f(x + w)} ${f(y + r)}V${f(y + h)}Z`
}

/** A block whose top edge is battlemented (merlons up, embrasures down). */
function battlements(x1: number, x2: number, top: number, bottom = GROUND, merlon = 14, gap = 10, h = 10): string {
  let d = `M${x1} ${bottom}V${top - h}H${x1 + merlon}`
  let x = x1 + merlon
  while (x + gap + merlon <= x2) {
    d += `V${top}H${x + gap}V${top - h}H${x + gap + merlon}`
    x += gap + merlon
  }
  return `${d}H${x2}V${bottom}Z`
}

/** Just the merlon tops of `battlements` (for winter snow caps). */
function merlonTops(x1: number, x2: number, top: number, merlon = 14, gap = 10, h = 10): string {
  let d = ''
  for (let x = x1; x + merlon <= x2; x += merlon + gap) d += `M${x + 2} ${top - h - 1}H${x + merlon - 2}`
  return d
}

function range(from: number, to: number, step: number): number[] {
  const out: number[] = []
  for (let v = from; v <= to; v += step) out.push(v)
  return out
}

/** Small deterministic PRNG so the scene (and particles) look the same on every render. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Scatter points on the lawn, keeping the gate path clear. */
function scatter(seed: number, n: number): [number, number][] {
  const r = mulberry32(seed)
  const out: [number, number][] = []
  while (out.length < n) {
    const x = r() * W
    const y = 848 + r() * 46
    if (x > 960 && x < 1270) continue
    out.push([x, y])
  }
  return out
}

/** Windows along a hall; some are lit (only visible as lit at dusk: winter + fall). */
function windowRow(x1: number, x2: number, y: number, seed: number, w = 14, h = 30, step = 34) {
  const dark: string[] = []
  const lit: string[] = []
  let i = 0
  for (let x = x1; x + w <= x2; x += step, i++) ((i * 7 + seed) % 5 < 2 ? lit : dark).push(lancet(x, y, w, h))
  return { dark: dark.join(''), lit: lit.join('') }
}

// ---------------------------------------------------------------------------
// Static geometry (season only changes colors + a few overlays)
// ---------------------------------------------------------------------------

const ORBS: Record<Season, { x: number; y: number; r: number; glow: number }> = {
  winter: { x: 1560, y: 170, r: 30, glow: 230 }, // moon at dusk
  spring: { x: 1660, y: 300, r: 44, glow: 330 }, // soft morning sun
  summer: { x: 1480, y: 150, r: 56, glow: 430 }, // high, warm sun
  fall: { x: 1700, y: 440, r: 50, glow: 400 }, // low amber sun behind the gym tower
}

const STARS_D = [
  [120, 80, 2], [260, 150, 1.4], [420, 60, 1.8], [560, 190, 1.2], [700, 110, 2], [860, 70, 1.4],
  [980, 170, 1.8], [1100, 90, 1.3], [1220, 40, 2], [1380, 120, 1.4], [1450, 260, 1.2], [1700, 90, 1.8],
  [1800, 210, 1.3], [1880, 60, 2], [640, 290, 1.2], [300, 270, 1.5], [1020, 300, 1.1], [1650, 320, 1.2],
]
  .map(([x, y, r]) => ellipse(x, y, r, r))
  .join('')
const CRATERS_D = ellipse(1550, 162, 7, 6) + ellipse(1570, 180, 5, 4) + ellipse(1556, 186, 3, 3)

function steeple(cx: number, base: number): string {
  return rect(cx - 15, base - 72, 30, 72) + rect(cx - 11, base - 104, 22, 32) + spike(cx - 9, base - 104, 18, 96)
}

const FAR_D = [
  // East Rock with the Soldiers and Sailors Monument
  'M0 664V578C70 562 130 542 176 506L206 480L272 470C332 464 392 476 442 494C512 518 572 562 652 612L700 664Z',
  rect(298, 418, 12, 54),
  spike(296, 420, 16, 18),
  // steeples on the New Haven Green
  steeple(560, 664),
  steeple(650, 664),
  // Sterling Memorial Library's tower
  rect(748, 478, 64, 186),
  rect(756, 452, 48, 28),
  spike(754, 452, 10, 26),
  spike(796, 452, 10, 26),
  spike(775, 452, 10, 46),
  // low rooftops
  gable(700, 748, 640, 610, 664),
  rect(812, 622, 70, 42),
  gable(882, 1000, 630, 588, 664),
  rect(1000, 616, 90, 48),
  gable(1090, 1180, 626, 596, 664),
  rect(1180, 628, 110, 36),
  rect(1420, 618, 120, 46),
  gable(1540, 1640, 620, 584, 664),
  // Payne Whitney Gym's stepped tower
  rect(1640, 610, 20, 54),
  rect(1660, 504, 90, 160),
  rect(1674, 462, 62, 42),
  rect(1686, 432, 38, 30),
  spike(1660, 504, 12, 26),
  spike(1738, 504, 12, 26),
  spike(1674, 462, 10, 22),
  spike(1726, 462, 10, 22),
  spike(1700, 432, 10, 30),
  gable(1750, 1860, 628, 590, 664),
  rect(1860, 620, 60, 44),
].join('')
const FAR_SNOW_D =
  'M176 506L206 480L272 470C332 464 392 476 442 494M700 640L724 610L748 640M882 630L941 588L1000 630M1090 626L1135 596L1180 626M1540 620L1590 584L1640 620M1750 628L1805 590L1860 628M1660 504H1750M1674 462H1736'

// Harkness Tower (center x = C): four stages, pinnacles, open crown.
const C = 1330
const HARKNESS_D = [
  rect(C - 68, 560, 136, 252),
  rect(C - 78, 600, 14, 212),
  spike(C - 78, 600, 14, 18),
  rect(C + 64, 600, 14, 212),
  spike(C + 64, 600, 14, 18),
  rect(C - 58, 440, 116, 120),
  spike(C - 60, 440, 12, 34),
  spike(C + 48, 440, 12, 34),
  rect(C - 48, 318, 96, 122),
  spike(C - 50, 318, 12, 40),
  spike(C + 38, 318, 12, 40),
  rect(C - 36, 236, 72, 82),
  spike(C - 38, 236, 10, 44),
  spike(C + 28, 236, 10, 44),
  rect(C - 32, 222, 64, 14),
  spike(C - 33, 222, 10, 64),
  spike(C - 17, 222, 8, 50),
  spike(C - 4, 222, 8, 86),
  spike(C + 9, 222, 8, 50),
  spike(C + 23, 222, 10, 64),
].join('')
const HARKNESS_SHADE_D = [rect(C + 22, 562, 46, 250), rect(C + 22, 442, 36, 118), rect(C + 18, 320, 30, 120), rect(C + 14, 238, 22, 80)].join('')
const HARKNESS_TRIM_D = [rect(C - 74, 552, 148, 10), rect(C - 62, 434, 124, 8), rect(C - 52, 312, 104, 8), rect(C - 39, 232, 78, 6)].join('')
const HARKNESS_WIN_D = [
  lancet(C - 18, 612, 36, 120),
  lancet(C - 40, 466, 22, 76),
  lancet(C + 18, 466, 22, 76),
  lancet(C - 32, 340, 24, 88),
  lancet(C + 8, 340, 24, 88),
  lancet(C - 10, 252, 20, 54),
  ...range(0, 3, 1).map((i) => rect(C - 26 + i * 14, 226, 6, 8)),
].join('')
const HARKNESS_LINES_D =
  `M${C} 630V732` + range(364, 420, 12).map((y) => `M${C - 32} ${y}h24M${C + 8} ${y}h24`).join('')
const HARKNESS_SNOW_D = [rect(C - 74, 548, 148, 5), rect(C - 62, 430, 124, 5), rect(C - 52, 308, 104, 5), rect(C - 39, 228, 78, 5)].join('')

// Collegiate-Gothic halls either side of the tower.
const MID_HALLS_D = [
  battlements(300, 520, 662),
  gable(520, 760, 626, 548),
  rect(700, 560, 18, 50),
  battlements(760, 1000, 642),
  battlements(1404, 1592, 640),
  rect(1592, 588, 46, 224),
  'M1586 592L1615 520L1644 592Z',
  gable(1638, 1822, 612, 530),
  rect(1664, 552, 18, 50),
  battlements(1822, 1920, 656),
].join('')
const MID_SHADE_D = [rect(1618, 590, 20, 222), rect(300, 792, 1620, 20)].join('')
const MID_WINDOW_ROWS = [
  windowRow(322, 510, 690, 1),
  windowRow(322, 510, 746, 3),
  windowRow(540, 600, 742, 2, 14, 30, 30),
  windowRow(688, 750, 742, 4, 14, 30, 30),
  windowRow(780, 990, 682, 0),
  windowRow(780, 990, 740, 2),
  windowRow(1420, 1580, 680, 1),
  windowRow(1420, 1580, 738, 4),
  windowRow(1650, 1694, 752, 3, 14, 30, 30),
  windowRow(1768, 1812, 752, 1, 14, 30, 30),
  windowRow(1834, 1920, 700, 2),
  windowRow(1834, 1920, 752, 0),
]
const MID_WIN_D = MID_WINDOW_ROWS.map((r) => r.dark).join('') + lancet(1606, 622, 12, 30) + lancet(1606, 694, 12, 30)
const MID_WIN_LIT_D = MID_WINDOW_ROWS.map((r) => r.lit).join('') + lancet(612, 652, 56, 98) + lancet(1702, 638, 56, 104)
const CHAPEL_TRACERY_D = 'M640 676V750M612 700H668M1730 662V742M1702 688H1758'
const MID_SNOW_D = [
  merlonTops(300, 520, 662),
  'M520 626L640 548L760 626',
  merlonTops(760, 1000, 642),
  merlonTops(1404, 1592, 640),
  'M1586 592L1615 520L1644 592',
  'M1638 612L1730 530L1822 612',
  merlonTops(1822, 1920, 656),
  'M700 560h18M1664 552h18',
].join('')

// A Phelps-Gate-style archway in front of the tower, with a glimpse of the quad.
const GATE_D = [battlements(1012, 1208, 602, 812, 12, 9, 9), battlements(992, 1034, 560, 812, 9, 6, 9), battlements(1186, 1228, 560, 812, 9, 6, 9)].join('')
const GATE_SHADE_D = rect(1020, 560, 14, 252) + rect(1214, 560, 14, 252)
const GATE_TRIM_D = lancet(1060, 640, 100, 172) + 'M1100 610H1120V622Q1120 632 1110 637Q1100 632 1100 622Z'
const GATE_ARCH_D = lancet(1068, 650, 84, 162)
const ARCH_LAWN_D = rect(1068, 790, 84, 22)
const ARCH_TREE_D = ellipse(1110, 728, 26, 22) + rect(1108, 744, 4, 48)
const GATE_WIN_D = lancet(1038, 668, 14, 44) + lancet(1168, 668, 14, 44)
const GATE_SLITS_D = lancet(1009, 606, 8, 26) + lancet(1009, 686, 8, 26) + lancet(1203, 606, 8, 26) + lancet(1203, 686, 8, 26)
const GATE_SNOW_D = merlonTops(1012, 1208, 602, 12, 9, 9) + merlonTops(992, 1034, 560, 9, 6, 9) + merlonTops(1186, 1228, 560, 9, 6, 9)

const LAWN_D = 'M0 806C400 796 800 802 1200 800S1700 794 1920 798V900H0Z'
const HEDGE_XS = [...range(310, 980, 64), ...range(1270, 1920, 64)]
const HEDGE_D = HEDGE_XS.map((x) => ellipse(x, 810, 38, 17)).join('')
const HEDGE_TOP_D = HEDGE_XS.map((x) => ellipse(x - 6, 799, 24, 8)).join('')
const LAMPS: [number, number][] = [
  [968, 812],
  [1252, 812],
  [1500, 812],
]

const GROUND_D = 'M0 834C360 814 760 828 1100 824S1640 812 1920 830V900H0Z'
const GROUND_SHADE_D = 'M0 872C480 854 1300 876 1920 858V900H0Z'
const PATH_D = 'M1086 824L1134 824L1296 900L924 900Z'
const BENCH_D = [rect(1372, 826, 76, 6), rect(1372, 812, 76, 5), rect(1376, 812, 4, 34), rect(1440, 812, 4, 34)].join('')
const BENCH_SNOW_D = rect(1372, 809, 76, 4) + rect(1372, 823, 76, 4)

interface TreeSpec {
  x: number
  y: number
  s: number
  tone: 'a' | 'b'
  flip?: boolean
}
const TREES: TreeSpec[] = [
  { x: 170, y: 842, s: 1.12, tone: 'b' },
  { x: 655, y: 838, s: 0.92, tone: 'a', flip: true },
  { x: 1612, y: 840, s: 1, tone: 'a' },
  { x: 1906, y: 846, s: 1.18, tone: 'b', flip: true },
]
const TREE_SHADOWS_D = TREES.map((t) => ellipse(t.x, t.y + 3, 74 * t.s, 9)).join('')

const DRIFTS_D = [ellipse(250, 846, 130, 9), ellipse(820, 852, 170, 8), ellipse(1520, 846, 150, 9), ellipse(1820, 854, 120, 8)].join('')
const FLOWERS = scatter(7, 46)
const FLOWERS_A_D = FLOWERS.slice(0, 26).map(([x, y]) => ellipse(x, y, 3.4, 3.4)).join('')
const FLOWERS_B_D = FLOWERS.slice(26).map(([x, y]) => ellipse(x, y, 2.6, 2.6)).join('')
const TUFTS_D = scatter(19, 34)
  .map(([x, y]) => `M${f(x)} ${f(y)}l-4-12M${f(x)} ${f(y)}l2-14M${f(x)} ${f(y)}l7-10`)
  .join('')
const LITTER = scatter(31, 60)
const LITTER_D = [0, 1, 2].map((k) =>
  LITTER.filter((_, i) => i % 3 === k)
    .map(([x, y]) => ellipse(x, y, 6, 3))
    .join(''),
)

// One vase-shaped American elm ("Elm City"), base at 0,0, ~470 units tall.
const TRUNK_D = 'M-24 0C-15-10-12-42-12-84C-12-122-10-142-6-158H6C10-142 12-122 12-84C12-42 15-10 24 0Z'
const LIMBS: [string, number][] = [
  ['M-4-150C-20-200-70-250-130-300', 13],
  ['M-2-152C-10-220-30-290-50-362', 11],
  ['M2-152C12-220 34-290 56-364', 11],
  ['M4-150C24-200 76-248 136-296', 13],
  ['M-70-252C-100-272-150-282-192-272', 6],
  ['M72-250C102-268 150-276 194-266', 6],
  ['M-30-292C-50-332-90-372-112-402', 5],
  ['M30-292C50-332 92-370 114-400', 5],
  ['M-50-362C-56-392-42-422-32-442', 4],
  ['M56-364C60-394 46-422 36-442', 4],
]
const TWIGS_D =
  'M-130-300l-30-32M-130-300l-46-6M-192-272l-26 8M-160-330l-8-24M136-296l32-30M136-296l46-4M194-266l26 8M168-326l10-22M-112-402l-18-30M-112-402l-30-8M114-400l18-30M114-400l30-8M-32-442l-6-30M-32-442l-22-14M36-442l8-30M36-442l22-14M-50-362l-30-20M56-364l30-20'
const LIMB_SNOW_D = LIMBS.slice(0, 8)
  .map(([d]) => d)
  .join('')
type Blob = [number, number, number, number]
const blobs = (list: Blob[]) => list.map(([cx, cy, rx, ry]) => ellipse(cx, cy, rx, ry)).join('')
const CANOPY_BACK_D = blobs([
  [-150, -292, 74, 54],
  [152, -290, 76, 54],
  [0, -352, 206, 84],
  [-196, -258, 44, 36],
  [198, -256, 46, 36],
])
const CANOPY_MID_D = blobs([
  [-104, -366, 124, 76],
  [104, -362, 126, 76],
  [0, -424, 124, 62],
  [-170, -310, 62, 44],
  [172, -306, 64, 44],
])
const CANOPY_HI_D = blobs([
  [-120, -398, 72, 40],
  [44, -446, 82, 36],
  [-40, -384, 62, 34],
  [120, -392, 60, 34],
])
const BLOOMS_D = [
  [-160, -330, 7], [-120, -410, 6], [-60, -360, 7], [-20, -440, 6], [30, -400, 7], [90, -430, 6],
  [140, -360, 7], [180, -300, 6], [-190, -280, 6], [-90, -310, 5], [60, -330, 6], [110, -300, 5],
  [0, -470, 5], [-140, -370, 5], [160, -410, 5], [-30, -330, 5], [200, -340, 5], [-210, -320, 5],
]
  .map(([x, y, r]) => ellipse(x, y, r, r))
  .join('')

const CLOUD_D =
  'M18 56C6 56 2 44 10 38C8 26 22 20 32 26C36 12 56 6 68 16C78 2 104 2 112 20C124 12 146 16 148 32C164 28 182 36 180 48C186 54 180 58 172 58Z'
const CLOUDS: Record<Season, { x: number; y: number; w: number; d: number; o: number }[]> = {
  winter: [
    { x: 12, y: 18, w: 20, d: 90, o: 0.4 },
    { x: 58, y: 9, w: 16, d: 110, o: 0.3 },
  ],
  spring: [
    { x: 6, y: 14, w: 22, d: 80, o: 0.9 },
    { x: 44, y: 6, w: 15, d: 100, o: 0.8 },
    { x: 72, y: 22, w: 24, d: 90, o: 0.85 },
  ],
  summer: [
    { x: 30, y: 12, w: 18, d: 100, o: 0.85 },
    { x: 64, y: 26, w: 14, d: 120, o: 0.7 },
  ],
  fall: [
    { x: 10, y: 20, w: 24, d: 90, o: 0.6 },
    { x: 52, y: 12, w: 18, d: 110, o: 0.5 },
    { x: 80, y: 30, w: 20, d: 100, o: 0.55 },
  ],
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

function Elm({ x, y, s, tone, flip = false, season }: TreeSpec & { season: Season }) {
  const bare = season === 'winter'
  const c = `cs-c${tone}`
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      {!bare && <path className={`${c}3`} d={CANOPY_BACK_D} />}
      <path className="cs-trunk" d={TRUNK_D} />
      {LIMBS.map(([d, w]) => (
        <path key={d} className="cs-limb" d={d} strokeWidth={w} />
      ))}
      {bare ? (
        <>
          <path className="cs-limb" d={TWIGS_D} strokeWidth={2.5} />
          <path className="cs-snow-line" d={LIMB_SNOW_D} strokeWidth={4} strokeDasharray="34 22" transform="translate(0 -5)" />
          <path className="cs-snow" d={ellipse(0, -2, 52, 9)} />
        </>
      ) : (
        <>
          <path className={`${c}2`} d={CANOPY_MID_D} />
          <path className={`${c}1`} d={CANOPY_HI_D} />
          {season === 'spring' && tone === 'a' && <path className="cs-bloom" d={BLOOMS_D} />}
          {season === 'fall' && <path className="cs-leafdot" d={BLOOMS_D} />}
        </>
      )}
    </g>
  )
}

function Lamp({ x, y, lit, snow }: { x: number; y: number; lit: boolean; snow: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {lit && (
        <>
          <circle className="cs-lamp-glow" cy={-176} r={62} />
          <circle className="cs-lamp-glow" cy={-176} r={32} />
        </>
      )}
      <path className="cs-iron" d={`M-11 0L-7-14H7L11 0Z${rect(-3.5, -156, 7, 142)}${rect(-8, -160, 16, 6)}M-17-190L0-204L17-190Z`} />
      <path className="cs-glass" d="M-12-160L-15-190H15L12-160Z" />
      <path className="cs-iron-line" d="M0-160V-190M-13.5-175H13.5" />
      <circle className="cs-iron" cy={-207} r={3.2} />
      {snow && <path className="cs-snow-line" d="M-15-191L0-203L15-191" strokeWidth={4} />}
    </g>
  )
}

function GroundDetails({ season }: { season: Season }) {
  if (season === 'winter') return <path className="cs-ground-hi" d={DRIFTS_D} />
  if (season === 'spring')
    return (
      <>
        <path className="cs-flower1" d={FLOWERS_A_D} />
        <path className="cs-flower2" d={FLOWERS_B_D} />
      </>
    )
  if (season === 'summer') return <path className="cs-grass" d={TUFTS_D} strokeWidth={3} />
  return (
    <>
      <path className="cs-litter1" d={LITTER_D[0]} />
      <path className="cs-litter2" d={LITTER_D[1]} />
      <path className="cs-litter3" d={LITTER_D[2]} />
    </>
  )
}

function SkyLayer({ season }: { season: Season }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const skyId = `cs-sky-${uid}`
  const glowId = `cs-glow-${uid}`
  const orb = ORBS[season]
  return (
    <div className="cs-layer cs-layer--sky" data-depth="0.4">
      <Svg>
        <defs>
          <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="cs-sky0" />
            <stop offset="0.45" className="cs-sky1" />
            <stop offset="0.75" className="cs-sky2" />
            <stop offset="1" className="cs-sky3" />
          </linearGradient>
          <radialGradient id={glowId}>
            <stop offset="0" className="cs-glow0" />
            <stop offset="1" className="cs-glow1" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill={`url(#${skyId})`} />
        {season === 'winter' && <path className="cs-star" d={STARS_D} />}
        <circle cx={orb.x} cy={orb.y} r={orb.glow} fill={`url(#${glowId})`} />
        <circle className="cs-orb" cx={orb.x} cy={orb.y} r={orb.r} />
        {season === 'winter' && <path className="cs-crater" d={CRATERS_D} />}
      </Svg>
      <div className="cs-clouds">
        {CLOUDS[season].map((c) => (
          <div
            key={c.x}
            className="cs-cloud"
            style={{ '--cx': `${c.x}%`, '--cy': `${c.y}%`, '--cw': `${c.w}%`, '--cd': `${c.d}s`, '--co': c.o } as CSSProperties}
          >
            <svg viewBox="0 0 190 64" aria-hidden="true" focusable="false">
              <path d={CLOUD_D} />
            </svg>
          </div>
        ))}
      </div>
    </div>
  )
}

function IllustratedArt({ season }: { season: Season }) {
  const winter = season === 'winter'
  const lampsLit = season !== 'spring'
  return (
    <>
      <SkyLayer season={season} />
      <div className="cs-layer" data-depth="0.3">
        <Svg>
          <path className="cs-far" d={FAR_D} />
          <rect className="cs-far2" x="0" y="660" width={W} height={H - 660} />
          {winter && <path className="cs-snow-line" d={FAR_SNOW_D} strokeWidth={5} />}
        </Svg>
      </div>
      <div className="cs-layer" data-depth="0.18">
        <Svg>
          <path className="cs-mid" d={MID_HALLS_D + HARKNESS_D} />
          <path className="cs-mid-dark" d={HARKNESS_SHADE_D + MID_SHADE_D} />
          <path className="cs-trim" d={HARKNESS_TRIM_D} />
          <path className="cs-win" d={HARKNESS_WIN_D + MID_WIN_D} />
          <path className="cs-win cs-win--lit" d={MID_WIN_LIT_D} />
          <path className="cs-louver" d={HARKNESS_LINES_D + CHAPEL_TRACERY_D} />
          {winter && (
            <>
              <path className="cs-snow" d={HARKNESS_SNOW_D} />
              <path className="cs-snow-line" d={MID_SNOW_D} strokeWidth={6} />
            </>
          )}
        </Svg>
      </div>
      <div className="cs-layer" data-depth="0.08">
        <Svg>
          <path className="cs-lawn" d={LAWN_D} />
          <path className="cs-near" d={GATE_D} />
          <path className="cs-near-dark" d={GATE_SHADE_D} />
          <path className="cs-near-trim" d={GATE_TRIM_D} />
          <path className="cs-arch" d={GATE_ARCH_D} />
          <path className="cs-lawn" d={ARCH_LAWN_D} />
          <path className="cs-near-dark" d={ARCH_TREE_D} />
          <path className="cs-win cs-win--lit" d={GATE_WIN_D} />
          <path className="cs-win" d={GATE_SLITS_D} />
          {winter && <path className="cs-snow-line" d={GATE_SNOW_D} strokeWidth={5} />}
          <path className="cs-hedge" d={HEDGE_D} />
          <path className={winter ? 'cs-snow' : 'cs-hedge-hi'} d={HEDGE_TOP_D} />
          {LAMPS.map(([x, y]) => (
            <Lamp key={x} x={x} y={y} lit={lampsLit} snow={winter} />
          ))}
        </Svg>
      </div>
      <div className="cs-layer" data-depth="0">
        <Svg>
          <path className="cs-ground" d={GROUND_D} />
          <path className="cs-ground-shade" d={GROUND_SHADE_D + TREE_SHADOWS_D} />
          <path className="cs-path" d={PATH_D} />
          <GroundDetails season={season} />
          <path className="cs-iron" d={BENCH_D} />
          {winter && <path className="cs-snow" d={BENCH_SNOW_D} />}
          {TREES.map((t) => (
            <Elm key={t.x} {...t} season={season} />
          ))}
        </Svg>
      </div>
      <div className="cs-tint" />
    </>
  )
}

/**
 * Real photo mode: the photo fills a pinned box (left edge set by --cs-photo-left, faded in
 * over --cs-photo-fade) and the illustrated skyline stays behind it as a faint navy layer.
 * Only the inner .cs-photo-drift layer moves (a slow translate); the box never resizes.
 */
function PhotoArt({ photo }: { photo: CampusPhoto }) {
  return (
    <>
      <div className="cs-layer" data-depth="0.1">
        <Svg>
          <path className="cs-ghost1" d={FAR_D} />
          <path className="cs-ghost2" d={MID_HALLS_D + HARKNESS_D} />
          <path className="cs-ghost3" d={LAWN_D + GATE_D + HEDGE_D} />
        </Svg>
      </div>
      <div className="cs-photo-box" data-depth="0.12">
        <div className="cs-photo-drift">
          <img className="cs-photo" src={photo.url} alt="" decoding="async" fetchPriority="high" />
        </div>
        <div className="cs-photo-shade" />
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Particles (≤40, CSS transforms only)
// ---------------------------------------------------------------------------

type ParticleKind = 'snow' | 'petal' | 'firefly' | 'leaf'
const PARTICLES: Record<Season, { kind: ParticleKind; count: number; seed: number }> = {
  winter: { kind: 'snow', count: 38, seed: 11 },
  spring: { kind: 'petal', count: 22, seed: 23 },
  summer: { kind: 'firefly', count: 24, seed: 37 },
  fall: { kind: 'leaf', count: 18, seed: 41 },
}
const LEAF_COLORS = ['#e8743b', '#c8462b', '#f2a541', '#d9572f', '#b8452a']
const PETAL_COLORS = ['#f6a8c4', '#f9c4d6', '#f08fb2', '#fde1ea']

function makeParticles(season: Season) {
  const { kind, count, seed } = PARTICLES[season]
  const rand = mulberry32(seed)
  const between = (a: number, b: number) => a + (b - a) * rand()
  return Array.from({ length: count }, (_, i) => {
    const dur =
      kind === 'snow' ? between(9, 18) : kind === 'petal' ? between(11, 17) : kind === 'leaf' ? between(10, 16) : between(7, 12)
    const size =
      kind === 'snow' ? between(3, 8) : kind === 'petal' ? between(9, 15) : kind === 'leaf' ? between(15, 24) : between(3, 6)
    const drift = kind === 'snow' ? between(-50, 60) : kind === 'firefly' ? between(-60, 60) : between(60, 180)
    const style: Record<string, string> = {
      '--x': `${between(-4, 100).toFixed(2)}%`,
      '--y': `${(kind === 'firefly' ? between(50, 92) : between(6, 92)).toFixed(1)}%`,
      '--d': `${dur.toFixed(2)}s`,
      '--dl': `${(-between(0, dur)).toFixed(2)}s`,
      '--s': `${size.toFixed(1)}px`,
      '--dx': `${drift.toFixed(0)}px`,
      '--sw': `${between(2.2, 5).toFixed(2)}s`,
      '--o': between(kind === 'snow' ? 0.45 : 0.75, 1).toFixed(2),
    }
    if (kind === 'leaf') style['--c'] = LEAF_COLORS[i % LEAF_COLORS.length]
    if (kind === 'petal') style['--c'] = PETAL_COLORS[i % PETAL_COLORS.length]
    return { id: i, style: style as CSSProperties }
  })
}

function Particles({ season }: { season: Season }) {
  const items = useMemo(() => makeParticles(season), [season])
  const kind = PARTICLES[season].kind
  return (
    <div className={`cs-particles cs-particles--${kind}`} aria-hidden="true">
      {items.map((p) => (
        <span key={p.id} className="cs-p" style={p.style}>
          {kind === 'leaf' ? (
            <svg viewBox="0 0 24 24" focusable="false">
              <path d={MAPLE_LEAF_PATH} />
            </svg>
          ) : (
            <i />
          )}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Motion: parallax (rAF, `translate` only) + pause while off-screen
// ---------------------------------------------------------------------------

function useSceneMotion(ref: RefObject<HTMLDivElement | null>, parallax: boolean, frameKey: number) {
  useEffect(() => {
    const root = ref.current
    if (!root || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([entry]) => root.classList.toggle('is-offscreen', !entry.isIntersecting))
    io.observe(root)
    return () => io.disconnect()
  }, [ref])

  useEffect(() => {
    const root = ref.current
    if (!root || !parallax || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const update = () => {
      frame = 0
      const rect = root.getBoundingClientRect()
      if (rect.bottom < -40) return // scrolled well past: leave the layers where they are
      // The scene sits at the top of the page, so the scroll offset is the parallax input.
      const y = Math.min(Math.max(window.scrollY, 0), rect.height)
      root.querySelectorAll<HTMLElement>('[data-depth]').forEach((el) => {
        const depth = Number(el.dataset.depth) || 0
        el.style.translate = depth ? `0 ${(y * depth).toFixed(1)}px` : ''
      })
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [ref, parallax, frameKey])
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

interface CampusSceneProps {
  season: Season
  /** Real campus photo for this season; the illustration then frames it. */
  photo?: CampusPhoto | null
  className?: string
  /** Accessible description (defaults to the season's scene description or photo title). */
  label?: string
  /** Pause particles and clouds (e.g. a visible "Pause motion" control). */
  paused?: boolean
  /** Scroll parallax on the layers (off automatically for reduced motion). */
  parallax?: boolean
}

interface Frame {
  id: number
  season: Season
  photo: CampusPhoto | null
}

export default function CampusScene({ season, photo = null, className = '', label, paused = false, parallax = true }: CampusSceneProps) {
  const rootRef = useRef<HTMLDivElement>(null)

  // Cross-fade between seasons: keep the previous frame underneath until the new one is in.
  const [frames, setFrames] = useState<Frame[]>(() => [{ id: 0, season, photo }])
  const current = frames[frames.length - 1]
  if (current.season !== season || (current.photo?.url ?? null) !== (photo?.url ?? null)) {
    setFrames([...frames.slice(-1), { id: current.id + 1, season, photo }])
  }

  useSceneMotion(rootRef, parallax, current.id)

  const description = label ?? (photo ? photo.title : SEASON_COPY[season].sceneLabel)

  return (
    <div ref={rootRef} className={`campus-scene${paused ? ' is-paused' : ''} ${className}`.trim()}>
      <div className="cs-stage" role="img" aria-label={description}>
        {frames.map((fr) => {
          const isCurrent = fr.id === current.id
          return (
            <div
              key={fr.id}
              className={`cs-frame cs--${fr.season}${fr.photo ? ' has-photo' : ''}${isCurrent ? ' is-current' : ' is-leaving'}`}
              onAnimationEnd={
                isCurrent && frames.length > 1
                  ? (e) => {
                      if (e.target === e.currentTarget) setFrames((all) => all.slice(-1))
                    }
                  : undefined
              }
            >
              {fr.photo ? <PhotoArt photo={fr.photo} /> : <IllustratedArt season={fr.season} />}
            </div>
          )
        })}
        <Particles key={season} season={season} />
      </div>
      {photo && (
        <p className="cs-credit">
          {photo.source_url ? (
            <a href={photo.source_url} target="_blank" rel="noopener noreferrer">
              {photo.credit || photo.title}
              <span className="cc-sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            photo.credit || photo.title
          )}
          {photo.license_url && (
            <>
              <span aria-hidden="true"> · </span>
              <a href={photo.license_url} target="_blank" rel="license noopener noreferrer">
                License<span className="cc-sr-only"> for this photo (opens in a new tab)</span>
              </a>
            </>
          )}
        </p>
      )}
    </div>
  )
}
