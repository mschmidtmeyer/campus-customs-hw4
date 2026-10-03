import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useBag, type BagItem } from '../bag/bagContext'
import { lineProblem } from '../bag/bagUtils'
import { formatPrice } from '../components/productUtils'
import './Bag.css'

const FEW_LEFT = 3

function BagLine({ item }: { item: BagItem }) {
  const { setQuantity, remove } = useBag()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const p = item.product
  const problem = lineProblem(item)
  const max = Math.max(1, Math.min(10, item.available))
  const name = p?.name ?? item.product_id

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your bag.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={`bag-line${problem ? ' has-problem' : ''}`}>
      <div className="bag-line__img">
        {p ? (
          <Link to={`/products/${encodeURIComponent(item.product_id)}`} tabIndex={-1} aria-hidden="true">
            <img src={p.image_url} alt="" />
          </Link>
        ) : null}
      </div>
      <div className="bag-line__info">
        {p ? (
          <Link className="bag-line__name" to={`/products/${encodeURIComponent(item.product_id)}`}>
            {name}
          </Link>
        ) : (
          <span className="bag-line__name">{name}</span>
        )}
        <p className="bag-line__meta">
          Size <strong>{item.size}</strong>
          {p && <> · {formatPrice(p.price)} each</>}
        </p>
        {problem ? (
          <p className="bag-line__warn">{problem}</p>
        ) : item.available <= FEW_LEFT ? (
          <p className="bag-line__few">Only {item.available} left</p>
        ) : null}
        <div className="bag-line__controls">
          <div className="bag-qty" role="group" aria-label={`Quantity for ${name}, size ${item.size}`}>
            <button
              type="button"
              aria-label="Decrease quantity"
              disabled={busy || item.quantity <= 1}
              onClick={() => run(() => setQuantity(item.product_id, item.size, item.quantity - 1))}
            >
              −
            </button>
            <span aria-live="polite">{item.quantity}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              disabled={busy || !p || item.quantity >= max}
              onClick={() => run(() => setQuantity(item.product_id, item.size, item.quantity + 1))}
            >
              +
            </button>
          </div>
          {p && item.quantity > item.available && item.available > 0 && (
            <button
              type="button"
              className="bag-link-btn"
              disabled={busy}
              onClick={() => run(() => setQuantity(item.product_id, item.size, item.available))}
            >
              Set to {item.available}
            </button>
          )}
          <button
            type="button"
            className="bag-link-btn"
            disabled={busy}
            aria-label={`Remove ${name}, size ${item.size}`}
            onClick={() => run(() => remove(item.product_id, item.size))}
          >
            Remove
          </button>
        </div>
        {error && (
          <p className="bag-line__error" role="alert">
            {error}
          </p>
        )}
      </div>
      <p className="bag-line__total">{p ? formatPrice(p.price * item.quantity) : '—'}</p>
    </li>
  )
}

export default function Bag() {
  const bag = useBag()
  const navigate = useNavigate()
  const { items, count, subtotal, loading, refresh } = bag
  const hasProblems = items.some((i) => lineProblem(i))

  // Re-check live price and stock each time the bag page opens.
  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading && items.length === 0) {
    return (
      <main className="page bag-page" aria-busy="true">
        <h1 className="bag-title">Your bag</h1>
        <p className="bag-muted">Loading your bag…</p>
      </main>
    )
  }

  if (items.length === 0) {
    return (
      <main className="page bag-page">
        <h1 className="bag-title">Your bag</h1>
        <div className="bag-empty">
          <p className="bag-empty__lead">Your bag is empty.</p>
          <p className="bag-muted">Find a hoodie, tee or cap to rep Yale.</p>
          <Link to="/products" className="bag-btn">
            Shop products
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="page bag-page">
      <h1 className="bag-title">
        Your bag <span className="bag-muted">({count} {count === 1 ? 'item' : 'items'})</span>
      </h1>
      {bag.notice && (
        <div className="bag-notice" role="status">
          <p>{bag.notice}</p>
          <button type="button" className="bag-link-btn" onClick={() => bag.dismissNotice?.()}>
            Dismiss
          </button>
        </div>
      )}
      <div className="bag-layout">
        <ul className="bag-lines" aria-label="Items in your bag">
          {items.map((item) => (
            <BagLine key={`${item.product_id}-${item.size}`} item={item} />
          ))}
        </ul>
        <aside className="bag-summary" aria-labelledby="bag-summary-title">
          <h2 id="bag-summary-title">Summary</h2>
          <dl>
            <div>
              <dt>Subtotal</dt>
              <dd>{formatPrice(subtotal)}</dd>
            </div>
            <div>
              <dt>Shipping &amp; tax</dt>
              <dd className="bag-muted">At checkout</dd>
            </div>
          </dl>
          <p className="bag-muted bag-summary__note">
            Free pickup at 57 Broadway, or $8 shipping (free over $100).
          </p>
          {hasProblems && (
            <p className="bag-line__warn" role="status">
              Some items need attention before checkout.
            </p>
          )}
          <button type="button" className="bag-btn bag-btn--block" disabled={hasProblems} onClick={() => navigate('/checkout')}>
            Continue to checkout
          </button>
          <Link to="/products" className="bag-summary__continue">
            Keep shopping
          </Link>
        </aside>
      </div>
    </main>
  )
}
