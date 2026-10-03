import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchProduct, fetchProducts, recordProductView } from '../api'
import { useAuth } from '../auth/authContext'
import { useBag } from '../bag/bagContext'
import WishlistButton from '../components/WishlistButton'
import ProductCard from '../components/ProductCard'
import ModelFigure, { SeasonBackdrop } from '../components/ModelFigure'
import { useSeason } from '../season/seasonContext'
import { formatPrice, swatchFor } from '../components/productUtils'
import type { Product, Size } from '../types'
import './Products.css'
import './ProductDetail.css'

const FEW_LEFT = 3

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; product: Product }
  | { status: 'not-found' }
  | { status: 'error' }

export default function ProductDetail() {
  const { productId = '' } = useParams()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    fetchProduct(productId)
      .then((product) => !cancelled && setState({ status: 'ready', product }))
      .catch((err: unknown) => {
        if (cancelled) return
        const notFound = err instanceof Error && err.message.startsWith('404')
        setState({ status: notFound ? 'not-found' : 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [productId, reloadToken])

  if (state.status === 'loading') {
    return (
      <main className="page product-detail" aria-busy="true">
        <div className="pd-layout">
          <div className="pd-media pd-media--skeleton" />
          <p className="pd-loading">Loading product…</p>
        </div>
      </main>
    )
  }

  if (state.status === 'not-found') {
    return (
      <main className="page product-detail">
        <div className="state-box">
          <h1 className="pd-state-title">We couldn't find that item</h1>
          <p>It may have been renamed or removed from the shop.</p>
          <Link to="/products" className="products-btn">
            Back to all products
          </Link>
        </div>
      </main>
    )
  }

  if (state.status === 'error') {
    return (
      <main className="page product-detail">
        <div className="state-box state-box--error" role="alert">
          <h1 className="pd-state-title">Can't reach the shop server</h1>
          <p>The product didn't load. Check that the backend is running, then try again.</p>
          <button type="button" className="products-btn" onClick={() => setReloadToken((t) => t + 1)}>
            Try again
          </button>
        </div>
      </main>
    )
  }

  return <ProductView key={state.product.product_id} product={state.product} />
}

function ProductView({ product }: { product: Product }) {
  const [selected, setSelected] = useState<Size | null>(null)
  const soldOut = product.total_stock <= 0
  const selectedLine = product.inventory.find((line) => line.size === selected)
  const { user } = useAuth()
  const recordedFor = useRef<string | null>(null)

  // Signed-in shoppers: remember this view for "Recently viewed" (fire-and-forget, once per mount).
  useEffect(() => {
    if (!user || recordedFor.current === product.product_id) return
    recordedFor.current = product.product_id
    recordProductView(product.product_id)
  }, [user, product.product_id])

  return (
    <main className="page product-detail">
      <nav className="pd-breadcrumb" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link to="/products">Products</Link>
          </li>
          <li>
            <Link to={`/products?garment_type=${encodeURIComponent(product.garment_type)}`}>{product.garment_type}</Link>
          </li>
          <li aria-current="page">{product.name}</li>
        </ol>
      </nav>

      <div className="pd-layout">
        <ProductMedia product={product} />

        <div className="pd-info">
          <p className="pd-type">{product.garment_type}</p>
          <h1 className="pd-name">{product.name}</h1>
          <p className="pd-price">{formatPrice(product.price)}</p>
          <p className="pd-description">{product.description}</p>

          <section className="pd-section" aria-labelledby="pd-colors">
            <h2 id="pd-colors" className="pd-section-title">
              Colors
            </h2>
            <ul className="pd-colors">
              {product.colors.map((color) => (
                <li key={color}>
                  <span className="pd-swatch" style={{ background: swatchFor(color) }} aria-hidden="true" />
                  {color}
                </li>
              ))}
            </ul>
          </section>

          <section className="pd-section" aria-labelledby="pd-sizes">
            <div className="pd-section-head">
              <h2 id="pd-sizes" className="pd-section-title">
                Size
              </h2>
              <Link to="/size-guide" className="pd-size-guide">
                Size guide
              </Link>
            </div>
            <div className="pd-size-grid" role="group" aria-labelledby="pd-sizes">
              {product.inventory.map((line) => {
                const out = line.quantity <= 0
                const few = !out && line.quantity <= FEW_LEFT
                const isSelected = selected === line.size
                return (
                  <button
                    key={line.size}
                    type="button"
                    className={`pd-size${out ? ' is-out' : ''}${isSelected ? ' is-selected' : ''}`}
                    disabled={out}
                    aria-pressed={isSelected}
                    aria-label={`${line.size}, ${out ? 'sold out' : `${line.quantity} in stock`}`}
                    onClick={() => setSelected(isSelected ? null : line.size)}
                  >
                    <span className="pd-size__label">{line.size}</span>
                    <span className={`pd-size__stock${few ? ' is-few' : ''}`}>
                      {out ? 'Sold out' : few ? `Only ${line.quantity} left` : `${line.quantity} in stock`}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="pd-stock-line">
              {soldOut ? (
                <strong className="pd-soldout-note">
                  Sold out in every size right now. Check back soon or ask our shop assistant about similar items.
                </strong>
              ) : selectedLine ? (
                <>
                  Size <strong>{selectedLine.size}</strong>: {selectedLine.quantity} available ·{' '}
                  {product.total_stock} total across all sizes
                </>
              ) : (
                <>{product.total_stock} in stock across all sizes</>
              )}
            </p>
          </section>

          <AddToBag product={product} size={selectedLine && selectedLine.quantity > 0 ? selectedLine.size : null} stock={selectedLine?.quantity ?? 0} soldOut={soldOut} />
        </div>
      </div>

      <RelatedProducts product={product} />
    </main>
  )
}

type MediaView = 'photo' | 'model'

/** Stable 0..5 model per product, so each item gets "its" person by default. */
function modelFor(productId: string): number {
  let h = 0
  for (const ch of productId) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % 6
}

/** Main image with a "Product photo / On a model" switch (the model is an HTML/CSS illustration). */
function ProductMedia({ product }: { product: Product }) {
  const [view, setView] = useState<MediaView>('photo')
  const [variant, setVariant] = useState(() => modelFor(product.product_id))
  const { season } = useSeason()
  return (
    <div className="pd-media-col">
      <div className="pd-view" role="group" aria-label="Image view" data-view={view}>
        <button type="button" className="pd-view__btn" aria-pressed={view === 'photo'} onClick={() => setView('photo')}>
          Product photo
        </button>
        <button type="button" className="pd-view__btn" aria-pressed={view === 'model'} onClick={() => setView('model')}>
          On a model
        </button>
      </div>
      <div className={`pd-media${view === 'model' ? ' pd-media--model' : ''}`}>
        {view === 'photo' ? (
          <img src={product.image_url} alt={product.name} />
        ) : (
          <>
            <SeasonBackdrop season={season} />
            <div className="pd-model">
              <ModelFigure product={product} variant={variant} />
            </div>
            <button type="button" className="pd-model__next" onClick={() => setVariant((v) => (v + 1) % 6)}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                <path
                  d="M4 12a8 8 0 0 1 13.7-5.6L20 8.7M20 4v4.7h-4.7M20 12a8 8 0 0 1-13.7 5.6L4 15.3M4 20v-4.7h4.7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Try another model
            </button>
          </>
        )}
      </div>
      {view === 'model' && (
        <p className="pd-model__note">An illustrated model wearing the actual product photo — colors and print are the real item.</p>
      )}
    </div>
  )
}

function AddToBag({ product, size, stock, soldOut }: { product: Product; size: Size | null; stock: number; soldOut: boolean }) {
  const { add } = useBag()
  const max = Math.max(1, Math.min(10, stock))
  const [qty, setQty] = useState(1)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const quantity = Math.min(qty, max)

  const onAdd = async () => {
    if (!size) {
      setStatus({ kind: 'error', text: 'Choose a size first.' })
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      await add(product.product_id, size, quantity)
      setStatus({ kind: 'ok', text: `Added ${quantity} × ${product.name} (${size}) to your bag` })
      setQty(1)
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Could not add to your bag.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pd-actions">
      <div className="pd-buy-row">
        <div className="pd-qty" role="group" aria-label="Quantity">
          <button
            type="button"
            className="pd-qty__btn"
            aria-label="Decrease quantity"
            disabled={!size || quantity <= 1}
            onClick={() => setQty(quantity - 1)}
          >
            −
          </button>
          <span className="pd-qty__value" aria-live="polite" aria-label={`Quantity ${quantity}`}>
            {quantity}
          </span>
          <button
            type="button"
            className="pd-qty__btn"
            aria-label="Increase quantity"
            disabled={!size || quantity >= max}
            onClick={() => setQty(quantity + 1)}
          >
            +
          </button>
        </div>
        <button
          type="button"
          className="pd-add"
          disabled={soldOut || busy}
          aria-describedby="pd-add-status"
          onClick={onAdd}
        >
          {soldOut ? 'Sold out' : busy ? 'Adding…' : size ? 'Add to bag' : 'Select a size'}
        </button>
        <WishlistButton productId={product.product_id} size="lg" />
      </div>
      <p id="pd-add-status" className={`pd-add-status${status ? ` is-${status.kind}` : ''}`} aria-live="polite">
        {status?.kind === 'ok' ? (
          <>
            {status.text} · <Link to="/bag">View bag</Link>
          </>
        ) : (
          status?.text
        )}
      </p>
    </div>
  )
}

function RelatedProducts({ product }: { product: Product }) {
  const [related, setRelated] = useState<Product[]>([])

  useEffect(() => {
    let cancelled = false
    fetchProducts({ garment_type: product.garment_type })
      .then((list) => {
        if (cancelled) return
        setRelated(list.filter((p) => p.product_id !== product.product_id).slice(0, 4))
      })
      .catch(() => {
        /* Recommendations are optional; hide the section on failure. */
      })
    return () => {
      cancelled = true
    }
  }, [product.garment_type, product.product_id])

  if (related.length === 0) return null

  return (
    <section className="pd-related" aria-labelledby="pd-related-title">
      <h2 id="pd-related-title">You might also like</h2>
      <div className="pd-related-grid">
        {related.map((p) => (
          <ProductCard key={p.product_id} product={p} />
        ))}
      </div>
    </section>
  )
}
