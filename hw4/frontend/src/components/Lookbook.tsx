import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { fetchLookbook, fetchProducts, fetchSeasonPicks } from '../api'
import { SEASONS, useSeason, type Season } from '../season/seasonContext'
import type { LookbookEntry, Product } from '../types'
import ModelFigure, { SeasonBackdrop, type ModelPose } from './ModelFigure'
import { formatPrice } from './productUtils'
import './Lookbook.css'

type Tab = 'all' | Season
const TABS: Tab[] = ['all', ...SEASONS]
const LABEL: Record<Tab, string> = { all: 'All', winter: 'Winter', spring: 'Spring', summer: 'Summer', fall: 'Fall' }

/** Fallback looks when GET /api/season?season=… isn't available. */
const CURATED: Record<Season, string[]> = {
  fall: ['2025-yale-vs-harvard-t-shirt', 'champion-reverse-weave-crewneck', 'saybrook-college-crewneck'],
  winter: ['brooks-brothers-bomber-jacket-yale', 'basic-hoodie-big-yale', 'yale-mom-hoodie'],
  spring: ['yale-maplehouse-diana-mockneck', 'branford-1-4-zip', 'school-of-management-crest-t-shirt'],
  summer: ['big-yale-tri-blend-t-shirt', 'dry-zone-long-sleeve', 'sailing-left-chest-hoodie'],
}

const SCENES: Record<Season, string[]> = {
  fall: ['Game day on Old Campus', 'Golden hour on Hillhouse', 'Office hours at Sterling', 'Leaf piles on Cross Campus'],
  winter: ['First snow on Cross Campus', 'Cocoa run down Chapel Street', 'Late night at Bass', 'Snow day on Old Campus'],
  spring: ['Spring Fling on Old Campus', 'Blue skies over Beinecke Plaza', 'Picnic on Cross Campus', 'Commencement week'],
  summer: ['Sailing out of Branford', 'Summer session strolls', 'Sunny days on the Green', 'Ice cream on Chapel Street'],
}

const PER_SEASON = 4
const PER_SEASON_IN_ALL = 2
const VARIANT_OFFSET: Record<Season, number> = { winter: 0, spring: 2, summer: 4, fall: 1 }
const REDUCED = '(prefers-reduced-motion: reduce)'

type Tile =
  | { kind: 'photo'; key: string; season: Season; entry: LookbookEntry; product: Product | null }
  | { kind: 'figure'; key: string; season: Season; product: Product; variant: number; pose: ModelPose; scene: string }
  | { kind: 'skeleton'; key: string }

const isSeason = (s: unknown): s is Season => SEASONS.includes(s as Season)
const usable = (p: Product | null | undefined): p is Product => !!p?.product_id && !!p.image_url

/** Up to n products, preferring a different garment type for each look. */
function pickLooks(products: Product[], n: number): Product[] {
  const seen = new Set<string>()
  const first: Product[] = []
  const rest: Product[] = []
  for (const p of products) {
    if (seen.has(p.garment_type)) rest.push(p)
    else {
      seen.add(p.garment_type)
      first.push(p)
    }
  }
  return [...first, ...rest].slice(0, n)
}

async function loadSeason(season: Season): Promise<Product[]> {
  try {
    const picks = (await fetchSeasonPicks(season)).filter(usable)
    if (picks.length) return picks
  } catch {
    // The per-season endpoint may not be live yet: use the curated looks.
  }
  const curated = (await fetchProducts({ ids: CURATED[season].join(',') })).filter(usable)
  if (!curated.length) throw new Error(`No looks for ${season}`)
  return curated
}

function onParallax(e: PointerEvent<HTMLElement>) {
  if (e.pointerType !== 'mouse' || window.matchMedia(REDUCED).matches) return
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  el.style.setProperty('--px', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3))
  el.style.setProperty('--py', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3))
}

function resetParallax(e: PointerEvent<HTMLElement>) {
  e.currentTarget.style.setProperty('--px', '0')
  e.currentTarget.style.setProperty('--py', '0')
}

function ProductLink({ product }: { product: Product }) {
  return (
    <>
      <h3 className="lb-card__name">
        <Link to={`/products/${encodeURIComponent(product.product_id)}`} className="lb-card__link">
          {product.name}
        </Link>
      </h3>
      <span className="lb-card__price">{formatPrice(product.price)}</span>
    </>
  )
}

function TileCard({ tile, onBroken }: { tile: Tile; onBroken: (file: string) => void }) {
  if (tile.kind === 'skeleton') {
    return (
      <div className="lb-card lb-card--skeleton" aria-hidden="true">
        <div className="lb-card__stage" />
        <div className="lb-card__body">
          <span className="lb-skel lb-skel--short" />
          <span className="lb-skel" />
        </div>
      </div>
    )
  }
  if (tile.kind === 'photo') {
    const { entry, product } = tile
    return (
      <article className="lb-card lb-card--photo" onPointerMove={onParallax} onPointerLeave={resetParallax}>
        <div className="lb-card__stage">
          <img
            className="lb-card__photo"
            src={entry.file}
            alt={entry.alt || entry.title}
            loading="lazy"
            onError={() => onBroken(entry.file)}
          />
          <span className="lb-card__ai">AI-generated lookbook photo</span>
        </div>
        <div className="lb-card__body">
          <p className="lb-card__scene">{entry.title}</p>
          {entry.caption && <p className="lb-card__caption">{entry.caption}</p>}
          {product && <ProductLink product={product} />}
        </div>
      </article>
    )
  }
  return (
    <article className={`lb-card lb-card--${tile.season}`} onPointerMove={onParallax} onPointerLeave={resetParallax}>
      <div className="lb-card__stage">
        <SeasonBackdrop season={tile.season} />
        <div className="lb-card__figure">
          <ModelFigure product={tile.product} variant={tile.variant} pose={tile.pose} decorative />
        </div>
        <span className="lb-card__tag">{LABEL[tile.season]}</span>
      </div>
      <div className="lb-card__body">
        <p className="lb-card__scene">{tile.scene}</p>
        <ProductLink product={tile.product} />
      </div>
    </article>
  )
}

/**
 * "Worn around campus": illustrated people wearing real catalogue pieces in front of a
 * seasonal campus backdrop, plus any AI-generated photos listed in /lookbook/lookbook.json.
 */
export default function Lookbook() {
  const { season: current, info, loading: seasonLoading } = useSeason()
  const [picked, setPicked] = useState<Tab | null>(null)
  const tab: Tab = picked ?? current
  const [loaded, setLoaded] = useState<Partial<Record<Season, Product[]>>>({})
  const [failed, setFailed] = useState<Partial<Record<Season, true>>>({})
  const inflight = useRef(new Set<Season>())
  const [entries, setEntries] = useState<LookbookEntry[]>([])
  const [photoProducts, setPhotoProducts] = useState<Record<string, Product>>({})
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set())
  const trackRef = useRef<HTMLUListElement>(null)
  const [edges, setEdges] = useState({ prev: false, next: false })
  const uid = useId()
  const titleId = `${uid}-title`
  const panelId = `${uid}-panel`
  const tabId = (t: Tab) => `${uid}-tab-${t}`

  const fromInfo = useCallback(
    (s: Season): Product[] | null => {
      const picks = info && info.season === s ? (info.picks ?? []).filter(usable) : []
      return picks.length ? picks : null
    },
    [info],
  )

  // Season looks: the provider's picks for the shown season, else fetch (with curated fallback).
  useEffect(() => {
    const needed = tab === 'all' ? SEASONS : [tab]
    for (const s of needed) {
      if (fromInfo(s) || loaded[s] || failed[s] || inflight.current.has(s)) continue
      if (s === current && seasonLoading) continue // the provider is fetching this one already
      inflight.current.add(s)
      void loadSeason(s)
        .then(
          (products) => setLoaded((m) => ({ ...m, [s]: products })),
          () => setFailed((m) => ({ ...m, [s]: true })),
        )
        .finally(() => inflight.current.delete(s))
    }
  }, [tab, current, seasonLoading, fromInfo, loaded, failed])

  // Optional AI photos (public/lookbook/lookbook.json) + their live product prices.
  useEffect(() => {
    let alive = true
    void (async () => {
      const list = (await fetchLookbook()).filter((e) => isSeason(e.season))
      if (!alive || list.length === 0) return
      setEntries(list)
      try {
        const ids = [...new Set(list.map((e) => e.product_id))]
        const products = await fetchProducts({ ids: ids.join(',') })
        if (alive) setPhotoProducts(Object.fromEntries(products.map((p) => [p.product_id, p])))
      } catch {
        // Photos still show; the price chip just stays hidden.
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const tiles = useMemo<Tile[]>(() => {
    const order = tab === 'all' ? [...SEASONS.slice(SEASONS.indexOf(current)), ...SEASONS.slice(0, SEASONS.indexOf(current))] : [tab]
    const perSeason = tab === 'all' ? PER_SEASON_IN_ALL : PER_SEASON
    const out: Tile[] = []
    for (const s of order) {
      for (const entry of entries) {
        if (entry.season === s && !broken.has(entry.file)) {
          out.push({ kind: 'photo', key: `photo-${entry.file}`, season: s, entry, product: photoProducts[entry.product_id] ?? null })
        }
      }
      const products = fromInfo(s) ?? loaded[s]
      if (products) {
        pickLooks(products, perSeason).forEach((product, i) =>
          out.push({
            kind: 'figure',
            key: `${s}-${product.product_id}`,
            season: s,
            product,
            variant: (VARIANT_OFFSET[s] + i) % 6,
            pose: i % 2 === 1 ? 'walk' : 'front',
            scene: SCENES[s][i % SCENES[s].length],
          }),
        )
      } else if (!failed[s]) {
        for (let i = 0; i < perSeason; i++) out.push({ kind: 'skeleton', key: `skeleton-${s}-${i}` })
      }
    }
    return out
  }, [tab, current, entries, broken, photoProducts, fromInfo, loaded, failed])

  const updateEdges = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    const next = { prev: el.scrollLeft > 4, next: el.scrollLeft < max - 4 }
    setEdges((cur) => (cur.prev === next.prev && cur.next === next.next ? cur : next))
  }, [])

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    updateEdges()
    const ro = new ResizeObserver(updateEdges)
    ro.observe(el)
    return () => ro.disconnect()
  }, [updateEdges, tiles.length])

  // A new tab starts at its first look.
  useEffect(() => {
    trackRef.current?.scrollTo({ left: 0 })
  }, [tab])

  const scrollPage = (dir: 1 | -1) => {
    const el = trackRef.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: window.matchMedia(REDUCED).matches ? 'auto' : 'smooth' })
  }

  const onTabsKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.indexOf(tab)
    const next =
      e.key === 'ArrowRight' ? (i + 1) % TABS.length
      : e.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? TABS.length - 1
      : -1
    if (next < 0) return
    e.preventDefault()
    setPicked(TABS[next])
    document.getElementById(tabId(TABS[next]))?.focus()
  }

  const markBroken = useCallback((file: string) => setBroken((cur) => new Set(cur).add(file)), [])
  const hasPhotos = tiles.some((t) => t.kind === 'photo')

  return (
    <section className="lb" aria-labelledby={titleId}>
      <div className="lb__head" data-reveal="up">
        <p className="lb__eyebrow">The lookbook</p>
        <h2 id={titleId}>Worn around campus</h2>
        <p className="lb__sub">Real pieces from our shelves, styled for every New Haven season. Tap a look to shop it.</p>
      </div>

      <div className="lb__bar" data-reveal="up" data-reveal-delay="1">
        <div className="lb__tabs" role="tablist" aria-label="Lookbook season" onKeyDown={onTabsKey}>
          {TABS.map((t) => (
            <button
              key={t}
              id={tabId(t)}
              type="button"
              role="tab"
              className="lb__tab"
              aria-selected={t === tab}
              aria-controls={panelId}
              tabIndex={t === tab ? 0 : -1}
              onClick={() => setPicked(t)}
            >
              {LABEL[t]}
              {t === current && <span className="lb__now">Now</span>}
            </button>
          ))}
        </div>
        {(edges.prev || edges.next) && (
          <div className="lb__nav">
            <button type="button" className="lb__arrow" aria-label="Previous looks" disabled={!edges.prev} onClick={() => scrollPage(-1)}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button type="button" className="lb__arrow" aria-label="More looks" disabled={!edges.next} onClick={() => scrollPage(1)}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div id={panelId} role="tabpanel" aria-labelledby={tabId(tab)} className="lb__panel">
        {tiles.length === 0 ? (
          <p className="lb__empty">
            The lookbook is restocking right now — <Link to="/products">browse every piece</Link> in the meantime.
          </p>
        ) : (
          <ul className="lb__track" ref={trackRef} onScroll={updateEdges}>
            {tiles.map((tile, i) => (
              <li key={tile.key} className="lb__tile" data-reveal="up" data-reveal-delay={String((i % 4) + 1)}>
                <TileCard tile={tile} onBroken={markBroken} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="lb__note">
        Looks are illustrations by Campus Customs — every figure wears the actual product photo.
        {hasPhotos && ' Photos marked “AI-generated” are not real photoshoots.'}
      </p>
    </section>
  )
}
