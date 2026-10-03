import type { CSSProperties } from 'react'
import type { Season } from '../season/seasonContext'
import type { Product } from '../types'
import { FIGURE, garmentLayout, useGarmentFit, type GarmentFit } from './garmentCutout'
import './ModelFigure.css'

export type ModelPose = 'front' | 'walk'

interface ModelFigureProps {
  product: Product
  /** 0..5 — skin tone, hair style and outfit. */
  variant?: number
  pose?: ModelPose
  /** Hide from assistive tech when a caption already names the product. */
  decorative?: boolean
  className?: string
}

type HairStyle = 'crop' | 'long' | 'curls' | 'bun' | 'pony' | 'bob'

interface Look {
  skin: string
  hair: string
  style: HairStyle
  pants: string
  shoe: string
  accent: string
}

/** Six illustrated people: varied skin tones, hair, jeans / chinos and sneakers. */
const LOOKS: Look[] = [
  { skin: '#f1cfb8', hair: '#5a3a24', style: 'crop', pants: '#3d5f8e', shoe: '#ffffff', accent: '#00356b' },
  { skin: '#8d5a3b', hair: '#1b1715', style: 'long', pants: '#c7b18a', shoe: '#ffffff', accent: '#286dc0' },
  { skin: '#5f3b26', hair: '#191413', style: 'curls', pants: '#2c3340', shoe: '#f4f6f9', accent: '#c8102e' },
  { skin: '#e6b48f', hair: '#8a4526', style: 'bun', pants: '#87a7ca', shoe: '#ffffff', accent: '#00356b' },
  { skin: '#f6dccb', hair: '#d6ae63', style: 'pony', pants: '#2b3b5a', shoe: '#fdfdfd', accent: '#63aaff' },
  { skin: '#c18659', hair: '#2b1d16', style: 'bob', pants: '#dcd2bb', shoe: '#ffffff', accent: '#00356b' },
]

// Figure coordinates (see FIGURE): 1 unit = 1cqw; the figure is 100 units wide and 200 tall.
const ARM_W = 7.6

interface Pt {
  x: number
  y: number
}

const u = (n: number) => `${n.toFixed(2)}cqw`

/** Bare arm from a short sleeve down to a hand by the hip. */
function Arm({ from, hem, side }: { from: Pt; hem: number; side: 'l' | 'r' }) {
  const start = { x: from.x, y: from.y - 3 }
  const hand = { x: from.x + (FIGURE.neckX - from.x) * 0.12, y: Math.max(hem - 4, from.y + 40) }
  const dx = hand.x - start.x
  const dy = hand.y - start.y
  const style: CSSProperties = {
    left: u(start.x - ARM_W / 2),
    top: u(start.y),
    height: u(Math.hypot(dx, dy)),
    rotate: `${((-Math.atan2(dx, dy) * 180) / Math.PI).toFixed(2)}deg`,
  }
  return (
    <span className={`mf__arm mf__arm--${side}`} style={style}>
      <span className="mf__hand" />
    </span>
  )
}

function Figure({ fit }: { fit: GarmentFit }) {
  const g = garmentLayout(fit)
  const legTop = Math.min(140, g.hem - 12)
  const legStyle: CSSProperties = { top: u(legTop), height: u(FIGURE.ankle - legTop) }
  const [cl, cr] = g.cuffs
  return (
    <span className="mf__body">
      <span className="mf__shadow" />
      <span className="mf__hair-back" />
      <span className="mf__leg mf__leg--l" style={legStyle}>
        <span className="mf__pant" />
        <span className="mf__shoe" />
      </span>
      <span className="mf__leg mf__leg--r" style={legStyle}>
        <span className="mf__pant" />
        <span className="mf__shoe" />
      </span>
      {cl &&
        cr &&
        (fit.longSleeves ? (
          <>
            <span className="mf__hand mf__hand--l" style={{ left: u(cl.x + 1 - 4.2), top: u(cl.y - 1.5) }} />
            <span className="mf__hand mf__hand--r" style={{ left: u(cr.x - 1 - 4.2), top: u(cr.y - 1.5) }} />
          </>
        ) : (
          <>
            <Arm from={cl} hem={g.hem} side="l" />
            <Arm from={cr} hem={g.hem} side="r" />
          </>
        ))}
      <img
        className={`mf__garment${fit.cutout ? '' : ' mf__garment--blend'}`}
        src={fit.src}
        alt=""
        draggable={false}
        style={{ left: u(g.x), top: u(g.y), width: u(g.width), height: u(g.height) }}
      />
      <span className="mf__neck" />
      <span className="mf__head">
        <span className="mf__ear mf__ear--l" />
        <span className="mf__ear mf__ear--r" />
        <span className="mf__brow mf__brow--l" />
        <span className="mf__brow mf__brow--r" />
        <span className="mf__eye mf__eye--l" />
        <span className="mf__eye mf__eye--r" />
        <span className="mf__cheek mf__cheek--l" />
        <span className="mf__cheek mf__cheek--r" />
        <span className="mf__smile" />
        <span className="mf__hair" />
      </span>
    </span>
  )
}

/**
 * An illustrated (HTML/CSS) person wearing the REAL product photo as their top.
 * The photo is cut out of its background, then scaled so its shoulders match the
 * figure and translated so its collar sits right under the chin.
 */
export default function ModelFigure({ product, variant = 0, pose = 'front', decorative = false, className = '' }: ModelFigureProps) {
  const fit = useGarmentFit(product.image_url, product.garment_type)
  const index = ((Math.trunc(variant) % LOOKS.length) + LOOKS.length) % LOOKS.length
  const look = LOOKS[index]
  const style = {
    '--mf-skin': look.skin,
    '--mf-hair': look.hair,
    '--mf-pants': look.pants,
    '--mf-shoe': look.shoe,
    '--mf-accent': look.accent,
    '--mf-delay': `${-index * 1.1}s`,
  } as CSSProperties
  const a11y = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'img', 'aria-label': `Illustrated model wearing the ${product.name}` }
  return (
    <span className={`mf mf--${pose} mf--hair-${look.style} ${className}`.trim()} style={style} {...a11y}>
      {fit ? <Figure fit={fit} /> : <span className="mf__ghost" />}
    </span>
  )
}

const PARTICLES: Record<Season, number> = { winter: 10, spring: 8, summer: 0, fall: 8 }
const HALL_WINDOWS = [6, 20, 34, 48, 62]

/** Seasonal campus backdrop card: sky gradient, Gothic silhouette, snow / petals / sun / leaves. */
export function SeasonBackdrop({ season, className = '' }: { season: Season; className?: string }) {
  return (
    <span className={`sb sb--${season} ${className}`.trim()} aria-hidden="true">
      {season === 'summer' && (
        <>
          <span className="sb__sun" />
          <span className="sb__cloud" />
          <span className="sb__cloud sb__cloud--2" />
        </>
      )}
      {season === 'fall' && <span className="sb__glow" />}
      <svg className="sb__campus" viewBox="0 0 200 180" preserveAspectRatio="xMidYMax meet" focusable="false">
        <path
          className="sb__stone"
          d="M0 180V122l8-6v-6l3-6 3 6v6h25v-8l3-7 3 7v8h25v-6l3-6 3 6v6l2 6v58ZM106 180V58l3-12 3 12V32l3-10 3 10V16l8-12 8 12v16l3-10 3 10v26l3-12 3 12v122ZM152 180v-44l24-18 24 18v44Z"
        />
        <g className="sb__windows">
          {HALL_WINDOWS.map((x) => (
            <path key={x} d={`M${x} 152v-12q0-8 4-11q4 3 4 11v12Z`} />
          ))}
          <path d="M117 124v-24q0-9 4.5-12q4.5 3 4.5 12v24ZM127 124v-24q0-9 4.5-12q4.5 3 4.5 12v24ZM122 54v-9q0-6 4-8q4 2 4 8v9Z" />
          <circle cx="126" cy="72" r="5" />
          <path d="M162 166v-10q0-5 3-7q3 2 3 7v10ZM174 166v-10q0-5 3-7q3 2 3 7v10ZM186 166v-10q0-5 3-7q3 2 3 7v10Z" />
        </g>
        <path className="sb__snowcap" d="M1 121l7-5M14 116h25M45 116h25M106 58h6M140 58h6M112 32h6M134 32h6M152 136l24-18 24 18" />
        <g className="sb__trees">
          <rect x="89" y="156" width="3" height="24" className="sb__trunk" />
          <circle cx="84" cy="158" r="13" className="sb__leaf-b" />
          <circle cx="97" cy="150" r="12" className="sb__leaf-a" />
          <circle cx="90" cy="140" r="9" className="sb__leaf-a" />
          <rect x="191" y="160" width="3" height="20" className="sb__trunk" />
          <circle cx="192" cy="154" r="12" className="sb__leaf-a" />
          <circle cx="183" cy="162" r="9" className="sb__leaf-b" />
        </g>
      </svg>
      <span className="sb__ground" />
      {PARTICLES[season] > 0 && (
        <span className="sb__fx">
          {Array.from({ length: PARTICLES[season] }, (_, i) => (
            <span key={i} className="sb__p" style={{ '--i': i } as CSSProperties} />
          ))}
        </span>
      )}
    </span>
  )
}
