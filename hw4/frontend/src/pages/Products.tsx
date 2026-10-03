import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchFilters, fetchProducts } from '../api'
import { HandsomeDanFace } from '../components/ChatPanel'
import ProductCard from '../components/ProductCard'
import { swatchFor } from '../components/productUtils'
import { SIZES, type FilterOptions, type Product, type ProductQuery, type Size } from '../types'
import './Products.css'

const SORTS: { value: NonNullable<ProductQuery['sort']>; label: string }[] = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
]
const FILTER_KEYS = ['q', 'garment_type', 'color', 'size', 'min_price', 'max_price', 'in_stock', 'ids'] as const

function toNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** Turn URL search params into a validated ProductQuery. */
function queryFromParams(params: URLSearchParams): ProductQuery {
  const size = params.get('size')
  const sort = params.get('sort')
  return {
    q: params.get('q')?.trim() || undefined,
    garment_type: params.get('garment_type') || undefined,
    color: params.get('color') || undefined,
    size: size && (SIZES as readonly string[]).includes(size) ? (size as Size) : undefined,
    min_price: toNumber(params.get('min_price')),
    max_price: toNumber(params.get('max_price')),
    in_stock: params.get('in_stock') === 'true' || undefined,
    sort: SORTS.some((s) => s.value === sort) ? (sort as ProductQuery['sort']) : undefined,
    ids: parseIds(params.get('ids')),
  }
}

/** Normalise a comma-separated id list ("a, b,,c" -> "a,b,c"); undefined when empty. */
function parseIds(value: string | null): string | undefined {
  const ids = (value ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  return ids.length > 0 ? ids.join(',') : undefined
}

function titleCase(text: string): string {
  return text.replace(/(^|[\s-])\w/g, (m) => m.toUpperCase())
}

type Status = 'loading' | 'ready' | 'error'

/** What the server actually searched for after typo/synonym fixes (backend/search.py). */
interface SearchCorrection {
  typed: string
  corrected_q: string
}

async function fetchCorrection(q: string, signal: AbortSignal): Promise<SearchCorrection | null> {
  const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`, { signal })
  if (!res.ok) return null
  const data = (await res.json()) as { corrected_q: string; corrections: Record<string, string> }
  return Object.keys(data.corrections).length > 0 ? { typed: q, corrected_q: data.corrected_q } : null
}

export default function Products() {
  const [params, setParams] = useSearchParams()
  const query = queryFromParams(params)
  const queryKey = JSON.stringify(query)
  // "Chat results mode": Handsome Dan sent the shopper here with ?ids=…&chat=<label>.
  const chatMode = query.ids !== undefined
  const chatLabel = params.get('chat')?.trim() || ''

  const [products, setProducts] = useState<Product[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [correction, setCorrection] = useState<SearchCorrection | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [filters, setFilters] = useState<FilterOptions | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const setParam = useCallback(
    (key: string, value: string | undefined) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value === undefined || value === '') next.delete(key)
          else next.set(key, value)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  // Text and price inputs update the URL after a short pause in typing.
  // Live search: commit after 120 ms so results follow every keystroke.
  const [search, setSearch] = useDebouncedParam(params.get('q') ?? '', (v) => setParam('q', v), 120)
  const [minPrice, setMinPrice] = useDebouncedParam(params.get('min_price') ?? '', (v) => setParam('min_price', v))
  const [maxPrice, setMaxPrice] = useDebouncedParam(params.get('max_price') ?? '', (v) => setParam('max_price', v))

  useEffect(() => {
    let cancelled = false
    fetchFilters()
      .then((f) => !cancelled && setFilters(f))
      .catch(() => {
        /* Sidebar falls back to search, sizes, and sort only. */
      })
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  useEffect(() => {
    // Abort the previous request so a slow, older response can never overwrite a newer one.
    // Previous products stay on screen (dimmed slightly) while the next ones load.
    const controller = new AbortController()
    const q = (JSON.parse(queryKey) as ProductQuery).q
    setStatus('loading')
    Promise.all([
      fetchProducts(JSON.parse(queryKey) as ProductQuery, controller.signal),
      q ? fetchCorrection(q, controller.signal).catch(() => null) : Promise.resolve(null),
    ])
      .then(([list, fix]) => {
        if (controller.signal.aborted) return
        setProducts(list)
        setCorrection(fix)
        setStatus('ready')
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error')
      })
    return () => controller.abort()
  }, [queryKey, reloadToken])

  // Count only filters that survived validation (e.g. ?size=foo is ignored).
  const activeCount = FILTER_KEYS.filter((k) => query[k] !== undefined).length

  function clearFilters() {
    // Drop any half-typed text so a pending debounce can't re-apply it.
    setSearch('')
    setMinPrice('')
    setMaxPrice('')
    setParams(
      (prev) => {
        const next = new URLSearchParams()
        const sort = prev.get('sort')
        if (sort) next.set('sort', sort)
        return next
      },
      { replace: true },
    )
  }

  function showAllProducts() {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('ids')
        next.delete('chat')
        return next
      },
      { replace: true },
    )
  }

  function toggleParam(key: string, value: string) {
    setParam(key, params.get(key) === value ? undefined : value)
  }

  const heading = query.garment_type ? `${titleCase(query.garment_type)}s` : 'Shop all merch'

  return (
    <main className="page products-page">
      <header className="products-header">
        <div>
          <p className="products-eyebrow">Campus Customs</p>
          <h1>{heading}</h1>
        </div>
        <div className="products-toolbar">
          <button
            type="button"
            className="filters-toggle"
            aria-expanded={filtersOpen}
            aria-controls="product-filters"
            onClick={() => setFiltersOpen((o) => !o)}
          >
            Filters{activeCount > 0 ? ` (${activeCount})` : ''}
          </button>
          <label className="sort-control">
            <span>Sort by</span>
            <select value={query.sort ?? 'name'} onChange={(e) => setParam('sort', e.target.value === 'name' ? undefined : e.target.value)}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="products-layout">
        <aside
          id="product-filters"
          className={`filters${filtersOpen ? ' filters--open' : ''}`}
          aria-label="Product filters"
        >
          <div className="filter-group">
            <label htmlFor="filter-search" className="filter-title">
              Search
            </label>
            <input
              id="filter-search"
              type="search"
              className="filter-input"
              placeholder="Name or keyword, e.g. dad, Berkeley"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {correction && correction.typed === query.q && (
              <p className="search-correction">
                Showing results for “<strong>{correction.corrected_q}</strong>” (you typed “{correction.typed}”)
              </p>
            )}
          </div>

          {filters && (
            <fieldset className="filter-group">
              <legend className="filter-title">Garment type</legend>
              <div className="type-list">
                <label className="type-option">
                  <input type="radio" name="garment_type" checked={!query.garment_type} onChange={() => setParam('garment_type', undefined)} />
                  <span>All types</span>
                </label>
                {filters.garment_types.map((type) => (
                  <label key={type} className="type-option">
                    <input
                      type="radio"
                      name="garment_type"
                      checked={query.garment_type === type}
                      onChange={() => setParam('garment_type', type)}
                    />
                    <span>{type}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {filters && (
            <fieldset className="filter-group">
              <legend className="filter-title">Color</legend>
              <div className="color-list">
                {filters.colors.map((color) => {
                  const active = query.color === color
                  return (
                    <button
                      key={color}
                      type="button"
                      className={`color-chip${active ? ' is-active' : ''}`}
                      aria-pressed={active}
                      onClick={() => toggleParam('color', color)}
                    >
                      <span className="swatch" style={{ background: swatchFor(color) }} aria-hidden="true" />
                      {color}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )}

          <fieldset className="filter-group">
            <legend className="filter-title">Size in stock</legend>
            <div className="size-list">
              {(filters?.sizes ?? SIZES).map((size) => {
                const active = query.size === size
                return (
                  <button
                    key={size}
                    type="button"
                    className={`size-chip${active ? ' is-active' : ''}`}
                    aria-pressed={active}
                    onClick={() => toggleParam('size', size)}
                  >
                    {size}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <fieldset className="filter-group">
            <legend className="filter-title">Price (USD)</legend>
            <div className="price-row">
              <label>
                <span className="sr-only">Minimum price</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  className="filter-input"
                  placeholder={filters ? `Min $${filters.price_min}` : 'Min'}
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                />
              </label>
              <span aria-hidden="true">–</span>
              <label>
                <span className="sr-only">Maximum price</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  className="filter-input"
                  placeholder={filters ? `Max $${filters.price_max}` : 'Max'}
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                />
              </label>
            </div>
          </fieldset>

          <div className="filter-group">
            <label className="toggle">
              <input
                type="checkbox"
                checked={!!query.in_stock}
                onChange={(e) => setParam('in_stock', e.target.checked ? 'true' : undefined)}
              />
              <span className="toggle__track" aria-hidden="true" />
              <span>In stock only</span>
            </label>
          </div>

          <button type="button" className="clear-filters" onClick={clearFilters} disabled={activeCount === 0}>
            Clear filters
          </button>
        </aside>

        <section className="results" aria-live="polite" aria-busy={status === 'loading'}>
          {status === 'error' ? (
            <div className="state-box state-box--error" role="alert">
              <h2>Can't reach the shop server</h2>
              <p>The product list didn't load. Check that the backend is running, then try again.</p>
              <button type="button" className="products-btn" onClick={() => setReloadToken((t) => t + 1)}>
                Try again
              </button>
            </div>
          ) : (
            <>
              {chatMode && (
                <div className="chat-results-banner">
                  <span className="chat-results-banner__avatar" aria-hidden="true">
                    <HandsomeDanFace />
                  </span>
                  <p>
                    {status === 'loading' ? (
                      <>Handsome Dan is fetching matches for “{chatLabel || 'your chat search'}”…</>
                    ) : (
                      <>
                        Handsome Dan found <strong>{products.length}</strong>{' '}
                        {products.length === 1 ? 'match' : 'matches'} for “{chatLabel || 'your chat search'}”
                      </>
                    )}
                  </p>
                  <button type="button" className="chat-results-banner__btn" onClick={showAllProducts}>
                    Show all products
                  </button>
                </div>
              )}
              <p className="result-count">
                {status === 'loading' && products.length === 0
                  ? 'Loading products…'
                  : `${products.length} ${products.length === 1 ? 'product' : 'products'}`}
                {status === 'loading' && products.length > 0 && (
                  <span className="result-updating" role="status">
                    <span className="result-updating__dot" aria-hidden="true" />
                    Updating…
                  </span>
                )}
              </p>
              {status === 'loading' && products.length === 0 ? (
                <div className="product-grid" aria-hidden="true">
                  {Array.from({ length: 8 }, (_, i) => (
                    <div key={i} className="skeleton-card" />
                  ))}
                </div>
              ) : status === 'ready' && products.length === 0 ? (
                <div className="state-box">
                  <h2>No matches</h2>
                  <p>Nothing in the shop fits all of those filters. Try removing one.</p>
                  <button type="button" className="products-btn" onClick={clearFilters}>
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className={`product-grid${status === 'loading' ? ' is-stale' : ''}`}>
                  {products.map((p) => (
                    <ProductCard key={p.product_id} product={p} />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  )
}

/**
 * Local input state that writes to the URL after `delay` ms without typing,
 * and follows the URL when it changes from elsewhere (e.g. "Clear filters").
 */
function useDebouncedParam(urlValue: string, commit: (value: string) => void, delay = 250) {
  const [value, setValue] = useState(urlValue)
  const lastCommitted = useRef(urlValue)
  const commitRef = useRef(commit)
  useEffect(() => {
    commitRef.current = commit
  })

  useEffect(() => {
    if (urlValue !== lastCommitted.current) {
      lastCommitted.current = urlValue
      setValue(urlValue)
    }
  }, [urlValue])

  useEffect(() => {
    const trimmed = value.trim()
    if (trimmed === lastCommitted.current) return
    const timer = window.setTimeout(() => {
      lastCommitted.current = trimmed
      commitRef.current(trimmed)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])

  return [value, setValue] as const
}
