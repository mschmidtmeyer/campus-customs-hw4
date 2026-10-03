import { useEffect, useRef, useState } from 'react'
import { preload } from 'react-dom'
import { Link } from 'react-router-dom'
import { fetchProducts } from '../api'
import CampusScene from '../components/CampusScene'
import Lookbook from '../components/Lookbook'
import ProductCard from '../components/ProductCard'
import SeasonIcon from '../components/SeasonIcon'
import { SEASONS, useSeason } from '../season/seasonContext'
import { SEASON_COPY } from '../season/seasonCopy'
import { STORE_ADDRESS, STORE_HOURS } from '../storeInfo'
import type { Product } from '../types'
import './Home.css'

// Hand-picked shop favorites (IDs from data/campus_customs.db). Names, prices and stock
// always come live from GET /api/products; nothing about a product is hard-coded here.
const FEATURED_IDS = [
  'basic-hoodie-big-yale',
  'champion-reverse-weave-crewneck',
  'district-vit-crewneck-vintage-bulldog',
  'benjamin-franklin-1-4-zip',
  'brooks-brothers-bomber-jacket-yale',
  'yale-maplehouse-diana-mockneck',
  'boola-boola-t-shirt',
  'yale-dad-crewneck',
]

const CATEGORIES: { type: string; label: string; image: string }[] = [
  { type: 'crewneck sweatshirt', label: 'Crewnecks', image: 'super-heavyweight-crewneck-arched-yale-crest' },
  { type: 'pullover hoodie', label: 'Pullover Hoodies', image: 'champion-reverse-weave-hoodie-1' },
  { type: 'short-sleeve t-shirt', label: 'T-Shirts', image: 'big-yale-tri-blend-t-shirt' },
  { type: 'quarter-zip pullover', label: 'Quarter-Zips', image: 'yale-law-school-1-4-zip' },
  { type: 'fleece jacket', label: 'Fleece Jackets', image: 'benjamin-franklin-fleece-jacket' },
  { type: 'full-zip hoodie', label: 'Full-Zip Hoodies', image: 'champion-full-zip-hood' },
  { type: 'long-sleeve performance shirt', label: 'Performance Long Sleeves', image: 'dry-zone-long-sleeve' },
  { type: 'mockneck sweatshirt', label: 'Mocknecks', image: 'yale-maplehouse-diana-mockneck' },
  { type: 'bomber jacket', label: 'Bomber Jackets', image: 'brooks-brothers-bomber-jacket-yale' },
]

const MARQUEE_WORDS = ['Boola Boola', 'Bulldogs', 'New Haven', 'Since 1701', 'Lux et Veritas', 'Elm City', 'Handsome Dan', 'Old Campus']

const ACCESSORIES = [
  { key: 'cap', name: 'Embroidered caps' },
  { key: 'tote', name: 'Canvas totes' },
  { key: 'mug', name: 'Bulldog mugs' },
  { key: 'scarf', name: 'Striped scarves' },
]

// ?v= must match IMAGE_VERSION in backend/main.py (cleaned white-background photos).
const imageFor = (id: string) => `/media/products/${id}.jpg?v=2`
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

type Load<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error' }

function useFeatured(): Load<Product[]> {
  const [state, setState] = useState<Load<Product[]>>({ status: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    fetchProducts({ ids: FEATURED_IDS.join(',') }, controller.signal)
      .then((list) => setState({ status: 'ready', data: list }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' })
      })
    return () => controller.abort()
  }, [])
  return state
}

/* ---------- small inline icons ---------- */

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M12 2.5a7 7 0 0 0-7 7c0 5 7 12 7 12s7-7 7-12a7 7 0 0 0-7-7Zm0 9.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2Z" />
    </svg>
  )
}

function MotionIcon({ paused }: { paused: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      {paused ? <path fill="currentColor" d="M8 5.5v13l10.5-6.5z" /> : <path fill="currentColor" d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z" />}
    </svg>
  )
}

function Arrow({ dir }: { dir: 'left' | 'right' | 'down' }) {
  const d = dir === 'left' ? 'M15 5l-7 7 7 7M8.5 12H20' : dir === 'right' ? 'M9 5l7 7-7 7M15.5 12H4' : 'M5 9l7 7 7-7M12 15.5V4'
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ---------- 1. Seasonal hero ---------- */

function SeasonSwitcher() {
  const { season, actualSeason, isPreview, setPreview } = useSeason()
  return (
    <div className="season-switch">
      <div className="season-switch__chips" role="group" aria-label="Preview the campus by season">
        {SEASONS.map((s) => {
          const now = s === actualSeason
          const active = s === season
          return (
            <button
              key={s}
              type="button"
              data-season={s}
              className={`season-chip${active ? ' is-active' : ''}`}
              aria-pressed={active}
              onClick={() => setPreview(now ? null : s)}
            >
              <SeasonIcon season={s} />
              <span>{SEASON_COPY[s].label}</span>
              {now && (
                <>
                  <span className="season-chip__now" aria-hidden="true">
                    Now
                  </span>
                  <span className="cc-sr-only"> (today)</span>
                </>
              )}
            </button>
          )
        })}
      </div>
      <div className="season-switch__status" aria-live="polite">
        {isPreview && (
          <p className="preview-pill">
            <span>Previewing {SEASON_COPY[season].label.toLowerCase()}</span>
            <span aria-hidden="true">·</span>
            <button type="button" onClick={() => setPreview(null)}>
              Back to today
            </button>
          </p>
        )}
      </div>
    </div>
  )
}

function SeasonHero() {
  const { season, info, photo } = useSeason()
  const copy = SEASON_COPY[season]
  const label = info?.label ?? copy.label
  const hasPicks = (info?.picks.length ?? 0) > 0
  const [paused, setPaused] = useState(false)

  // Only the season on screen gets its photo fetched early (other seasons load on preview).
  if (photo) preload(photo.url, { as: 'image', fetchPriority: 'high' })

  const jumpToPicks = () => {
    document.getElementById('in-season')?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })
    document.getElementById('in-season-title')?.focus({ preventScroll: true })
  }

  return (
    <section className={`hero${photo ? ' hero--photo' : ''}`} aria-labelledby="hero-title">
      <div className="hero__visual">
        <CampusScene season={season} photo={photo} paused={paused} className="hero__scene" />
        <div className="hero__scrim" aria-hidden="true" />
        <div className="hero__meta">
          <p className="hero__caption">
            <PinIcon />
            <span>{photo?.title ?? info?.campus_title ?? copy.campusTitle}</span>
          </p>
          <button
            type="button"
            className="hero__motion"
            aria-pressed={paused}
            aria-label="Pause campus animation"
            title={paused ? 'Play animation' : 'Pause animation'}
            onClick={() => setPaused((p) => !p)}
          >
            <MotionIcon paused={paused} />
          </button>
        </div>
      </div>

      <div className="hero__inner">
        <div className="hero__copy">
          <div className="hero__glow" aria-hidden="true" />
          <p className="hero__eyebrow">
            <SeasonIcon season={season} className="hero__eyebrow-icon" />
            {label} on campus · Officially licensed Yale apparel
          </p>
          <div className="hero__text" key={season}>
            <h1 id="hero-title" className="hero__title">
              {info?.headline ?? copy.headline}
            </h1>
            <p className="hero__lede">{info?.tagline ?? copy.tagline}</p>
          </div>
          <div className="hero__ctas">
            {hasPicks ? (
              <button type="button" className="btn btn--accent" onClick={jumpToPicks}>
                Shop {label.toLowerCase()} picks <Arrow dir="down" />
              </button>
            ) : (
              <Link to="/products" className="btn btn--accent">
                Shop the collection
              </Link>
            )}
            <Link to={hasPicks ? '/products' : '/visit'} className="btn btn--ghost">
              {hasPicks ? 'Shop everything' : 'Visit 57 Broadway'}
            </Link>
          </div>
          <SeasonSwitcher />
        </div>
      </div>
    </section>
  )
}

/* ---------- 2. Campus-words marquee ---------- */

function Marquee() {
  const { season } = useSeason()
  const [paused, setPaused] = useState(false)
  return (
    <div className={`marquee${paused ? ' is-paused' : ''}`}>
      <div className="marquee__viewport" aria-hidden="true">
        <div className="marquee__track">
          {[0, 1].map((copy) => (
            <ul key={copy} className="marquee__list">
              {MARQUEE_WORDS.map((word) => (
                <li key={word}>
                  <span>{word}</span>
                  <SeasonIcon season={season} className="marquee__icon" />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="marquee__toggle"
        aria-pressed={paused}
        aria-label="Pause scrolling banner"
        title={paused ? 'Play banner' : 'Pause banner'}
        onClick={() => setPaused((p) => !p)}
      >
        <MotionIcon paused={paused} />
      </button>
    </div>
  )
}

/* ---------- 3. In season now (live picks from /api/season) ---------- */

function SeasonRail() {
  const { season, info, loading, isPreview } = useSeason()
  const copy = SEASON_COPY[season]
  const label = info?.label ?? copy.label
  const picks = info?.picks ?? []
  const railRef = useRef<HTMLUListElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    let frame = 0
    const measure = () => {
      frame = 0
      setAtStart(rail.scrollLeft <= 4)
      setAtEnd(rail.scrollLeft >= rail.scrollWidth - rail.clientWidth - 4)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    const ro = new ResizeObserver(schedule)
    ro.observe(rail)
    rail.addEventListener('scroll', schedule, { passive: true })
    return () => {
      ro.disconnect()
      rail.removeEventListener('scroll', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [season, picks.length])

  const page = (dir: 1 | -1) => {
    const rail = railRef.current
    if (rail) rail.scrollBy({ left: dir * rail.clientWidth * 0.85, behavior: reducedMotion() ? 'auto' : 'smooth' })
  }

  const showArrows = picks.length > 1 && !(atStart && atEnd)

  return (
    <section id="in-season" className="section season-rail" aria-labelledby="in-season-title">
      <div className="season-rail__head" data-reveal="up">
        <div>
          <p className="eyebrow eyebrow--season">
            <SeasonIcon season={season} />
            {isPreview ? `${label} preview` : `${label} in New Haven`}
          </p>
          <h2 id="in-season-title" tabIndex={-1}>
            {isPreview ? `In season this ${label.toLowerCase()}` : 'In season now'}
          </h2>
          {picks.length > 0 && (
            <p className="season-rail__why">
              <strong>Why these?</strong> {info?.note ?? info?.tagline}
            </p>
          )}
        </div>
        {showArrows && (
          <div className="season-rail__nav">
            <button
              type="button"
              className="rail-arrow"
              aria-label="Previous picks"
              aria-controls="season-rail-list"
              disabled={atStart}
              onClick={() => page(-1)}
            >
              <Arrow dir="left" />
            </button>
            <button
              type="button"
              className="rail-arrow"
              aria-label="More picks"
              aria-controls="season-rail-list"
              disabled={atEnd}
              onClick={() => page(1)}
            >
              <Arrow dir="right" />
            </button>
          </div>
        )}
      </div>

      {loading && picks.length === 0 ? (
        <ul className="season-rail__list" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="season-rail__item">
              <div className="home-skeleton" />
            </li>
          ))}
        </ul>
      ) : picks.length > 0 ? (
        <ul
          key={season}
          id="season-rail-list"
          ref={railRef}
          className="season-rail__list"
          aria-label={`${label} picks`}
        >
          {picks.map((p) => (
            <li key={p.product_id} className="season-rail__item">
              <ProductCard product={p} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="season-rail__empty" data-reveal="up">
          <SeasonIcon season={season} className="season-rail__empty-icon" />
          <p>
            Our {label.toLowerCase()} picks are being restocked right now. Everything in the shop is still a
            click away.
          </p>
          <Link to="/products" className="btn btn--blue">
            Browse all products
          </Link>
        </div>
      )}
    </section>
  )
}

/* ---------- 5. Featured (live) ---------- */

function Featured() {
  const featured = useFeatured()
  return (
    <section className="section section--tint" aria-labelledby="featured-title">
      <div className="section__head" data-reveal="up">
        <p className="eyebrow">Shop favorites</p>
        <h2 id="featured-title">Pieces we can't keep on the shelf</h2>
        <p className="section__sub">The crewnecks, hoodies and zips our regulars keep coming back for.</p>
      </div>
      {featured.status === 'error' ? (
        <p className="home-note" role="status">
          We couldn't load our favorites just now. <Link to="/products">Browse every product</Link>
        </p>
      ) : (
        <ul className="featured">
          {featured.status === 'loading'
            ? // Distinct keys: loaded cards must mount as new nodes so ScrollReveal observes them.
              [0, 1, 2, 3].map((i) => (
                <li key={`skeleton-${i}`} aria-hidden="true">
                  <div className="home-skeleton" />
                </li>
              ))
            : featured.data.map((p, i) => (
                <li key={p.product_id} data-reveal="up" data-reveal-delay={String((i % 4) + 1)}>
                  <ProductCard product={p} />
                </li>
              ))}
        </ul>
      )}
      <div className="center" data-reveal="up">
        <Link to="/products" className="btn btn--blue">
          See all products <Arrow dir="right" />
        </Link>
      </div>
    </section>
  )
}

/* ---------- 7. CSS-drawn accessories (in-store only) ---------- */

function AccessoryArt({ kind }: { kind: string }) {
  return (
    <div className={`acc acc--${kind}`} aria-hidden="true">
      <span className="acc__a" />
      <span className="acc__b" />
      <span className="acc__c" />
    </div>
  )
}

export default function Home() {
  return (
    <main className="home">
      <SeasonHero />
      <Marquee />
      <SeasonRail />

      {/* Worn around campus: the lookbook (components/Lookbook.tsx) owns this section. */}
      <Lookbook />

      <Featured />

      <section className="section" aria-labelledby="cats-title">
        <div className="section__head section__head--split" data-reveal="up">
          <div>
            <p className="eyebrow">Find your fit</p>
            <h2 id="cats-title">Shop by category</h2>
          </div>
          <Link to="/size-guide" className="text-link">
            Size guide <Arrow dir="right" />
          </Link>
        </div>
        <ul className="cats">
          {CATEGORIES.map((c, i) => (
            <li key={c.type} data-reveal="up" data-reveal-delay={String((i % 4) + 1)}>
              <Link to={`/products?garment_type=${encodeURIComponent(c.type)}`} className="cat">
                <span className="cat__img">
                  <img src={imageFor(c.image)} alt="" loading="lazy" />
                </span>
                <span className="cat__label">
                  {c.label}
                  <span className="cat__arrow" aria-hidden="true">
                    <Arrow dir="right" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="section section--tint" aria-labelledby="acc-title">
        <div className="section__head" data-reveal="up">
          <p className="eyebrow">Finishing touches</p>
          <h2 id="acc-title">Round out the look</h2>
          <p className="section__sub">
            Caps, totes, mugs and scarves live on our shelves at the shop, not online. Stop by and we'll help
            you pick.
          </p>
        </div>
        <ul className="accs">
          {ACCESSORIES.map((a, i) => (
            <li key={a.key} className="acc-card" data-reveal="up" data-reveal-delay={String((i % 4) + 1)}>
              <AccessoryArt kind={a.key} />
              <h3>{a.name}</h3>
              <p className="acc-card__badge">In store only at 57 Broadway</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="visit-strip" aria-labelledby="visit-title">
        <div className="visit-strip__inner" data-reveal="up">
          <div>
            <p className="eyebrow eyebrow--light">
              <PinIcon /> {STORE_ADDRESS.street}, New Haven
            </p>
            <h2 id="visit-title">Come say hi on Broadway</h2>
            <p>
              {STORE_ADDRESS.street}, {STORE_ADDRESS.cityLine}. Try things on, plan a custom order, or just talk
              Yale with us.
            </p>
            <ul className="visit-strip__hours" aria-label="Store hours">
              {STORE_HOURS.map((h) => (
                <li key={h.days}>
                  <strong>{h.days}</strong> {h.hours}
                </li>
              ))}
            </ul>
          </div>
          <Link to="/visit" className="btn btn--white">
            Plan your visit <Arrow dir="right" />
          </Link>
        </div>
      </section>
    </main>
  )
}
