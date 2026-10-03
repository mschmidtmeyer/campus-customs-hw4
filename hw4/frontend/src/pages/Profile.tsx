import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { clearChatHistory, clearViewHistory, fetchActivity } from '../api'
import { useAuth } from '../auth/authContext'
import { useBag } from '../bag/bagContext'
import ProductCard from '../components/ProductCard'
import { formatPrice } from '../components/productUtils'
import { useWishlist } from '../wishlist/wishlistContext'
import type { Activity } from '../types'
import './Products.css'
import './Profile.css'

type LoadState = { status: 'loading' } | { status: 'ready'; data: Activity } | { status: 'error' }

/** SQLite timestamps are UTC "YYYY-MM-DD HH:MM:SS". */
function parseUtc(raw: string): Date {
  return new Date(`${raw.replace(' ', 'T')}Z`)
}

function formatDate(raw: string | null, withTime = false): string {
  if (!raw) return '—'
  const d = parseUtc(raw)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  })
}

function pageLabel(path: string | null): string {
  if (!path || path === '/') return 'Home'
  if (path.startsWith('/products/')) return 'A product page'
  if (path.startsWith('/products')) return 'Shop'
  if (path.startsWith('/visit')) return 'Visit us'
  if (path.startsWith('/about')) return 'About'
  if (path.startsWith('/size-guide')) return 'Size guide'
  return path
}

function initials(first: string | null, last: string | null, name: string): string {
  const parts = [first, last].filter(Boolean) as string[]
  const src = parts.length ? parts : name.split(/\s+/)
  return src
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('')
}

export default function Profile() {
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [busy, setBusy] = useState<'chats' | 'views' | null>(null)
  const wishlist = useWishlist()
  const bag = useBag()

  const load = useCallback(() => {
    fetchActivity()
      .then((data) => {
        if (data) setState({ status: 'ready', data })
        else navigate('/login', { replace: true, state: { from: '/profile' } })
      })
      .catch(() => setState({ status: 'error' }))
  }, [navigate])

  useEffect(() => {
    if (user) load()
  }, [user, load])

  if (loading) {
    return (
      <main className="page profile" aria-busy="true">
        <p className="profile__loading">Loading your profile…</p>
      </main>
    )
  }
  if (!user) return <Navigate to="/login" replace state={{ from: '/profile' }} />

  if (state.status === 'loading') {
    return (
      <main className="page profile" aria-busy="true">
        <div className="profile__skeleton" />
        <p className="profile__loading">Loading your profile…</p>
      </main>
    )
  }

  if (state.status === 'error') {
    return (
      <main className="page profile">
        <div className="state-box state-box--error" role="alert">
          <h1 className="profile__state-title">We couldn't load your profile</h1>
          <p>Check that the shop server is running, then try again.</p>
          <button
            type="button"
            className="products-btn"
            onClick={() => {
              setState({ status: 'loading' })
              load()
            }}
          >
            Try again
          </button>
        </div>
      </main>
    )
  }

  const { profile, searches, viewed, recommended_from_chat: picks, purchases, purchases_note } = state.data

  const run = (kind: 'chats' | 'views', action: () => Promise<void>) => {
    setBusy(kind)
    action()
      .then(load)
      .catch(() => setState({ status: 'error' }))
      .finally(() => setBusy(null))
  }

  return (
    <main className="page profile">
      <section className="profile__header" data-reveal="up" aria-labelledby="profile-name">
        <div className="profile__avatar" aria-hidden="true">
          {initials(profile.first_name, profile.last_name, profile.name)}
        </div>
        <div className="profile__who">
          <p className="profile__eyebrow">My profile</p>
          <h1 id="profile-name">{profile.name}</h1>
          <dl className="profile__facts">
            <div>
              <dt>Email</dt>
              <dd>{profile.email}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{profile.phone || 'Not added'}</dd>
            </div>
            <div>
              <dt>Member since</dt>
              <dd>{formatDate(profile.member_since)}</dd>
            </div>
          </dl>
        </div>
        <div className="profile__actions">
          <Link to="/account/password" className="profile__btn">
            Change password
          </Link>
          <button
            type="button"
            className="profile__btn profile__btn--ghost"
            onClick={() => {
              void logout().then(() => navigate('/'))
            }}
          >
            Log out
          </button>
        </div>
      </section>

      <section className="profile__section" data-reveal="up" aria-labelledby="profile-wishlist">
        <div className="profile__section-head">
          <h2 id="profile-wishlist">
            Wishlist
            {wishlist.items.length > 0 && <span className="profile__count"> ({wishlist.items.length})</span>}
          </h2>
        </div>
        {wishlist.loading && wishlist.items.length === 0 ? (
          <p className="profile__empty">Loading your wishlist…</p>
        ) : wishlist.items.length === 0 ? (
          <div className="profile__empty profile__empty--box">
            <p>Tap the heart on any product to save it.</p>
            <Link to="/products" className="profile__btn profile__btn--small">
              Browse the shop
            </Link>
          </div>
        ) : (
          <div className="profile__grid">
            {wishlist.items.map(({ product }) => (
              <ProductCard key={product.product_id} product={product} compact />
            ))}
          </div>
        )}
      </section>

      <section className="profile__section" data-reveal="up" aria-labelledby="profile-bag">
        <div className="profile__section-head">
          <h2 id="profile-bag">Your bag</h2>
          {bag.count > 0 && (
            <p className="profile__bag-total">
              {bag.count} {bag.count === 1 ? 'item' : 'items'} · <strong>{formatPrice(bag.subtotal)}</strong>
            </p>
          )}
        </div>
        {bag.items.length === 0 ? (
          <div className="profile__empty profile__empty--box">
            <p>{bag.loading ? 'Loading your bag…' : 'Your bag is empty.'}</p>
            <Link to="/products" className="profile__btn profile__btn--small">
              Start shopping
            </Link>
          </div>
        ) : (
          <>
            <ul className="profile__bag-lines">
              {bag.items.slice(0, 3).map((item) => (
                <li key={`${item.product_id}-${item.size}`} className="profile__bag-line">
                  <div className="profile__bag-thumb">
                    {item.product && <img src={item.product.image_url} alt="" loading="lazy" />}
                  </div>
                  <div className="profile__bag-info">
                    <Link to={`/products/${encodeURIComponent(item.product_id)}`} className="profile__bag-name">
                      {item.product?.name ?? item.product_id}
                    </Link>
                    <span className="profile__bag-meta">
                      Size {item.size} · Qty {item.quantity}
                    </span>
                  </div>
                  {item.product && (
                    <span className="profile__bag-price">{formatPrice(item.product.price * item.quantity)}</span>
                  )}
                </li>
              ))}
            </ul>
            {bag.items.length > 3 && (
              <p className="profile__bag-more">
                + {bag.items.length - 3} more {bag.items.length - 3 === 1 ? 'line' : 'lines'}
              </p>
            )}
            <div className="profile__bag-actions">
              <Link to="/bag" className="profile__btn profile__btn--ghost">
                View bag
              </Link>
              <Link to="/checkout" className="profile__btn">
                Checkout
              </Link>
            </div>
          </>
        )}
      </section>

      <section className="profile__section" data-reveal="up" aria-labelledby="profile-searches">
        <div className="profile__section-head">
          <h2 id="profile-searches">Your searches with Handsome Dan</h2>
          {searches.length > 0 && (
            <button
              type="button"
              className="profile__btn profile__btn--ghost profile__btn--small"
              disabled={busy !== null}
              onClick={() => run('chats', clearChatHistory)}
            >
              {busy === 'chats' ? 'Forgetting…' : 'Forget my chats'}
            </button>
          )}
        </div>
        {searches.length === 0 ? (
          <p className="profile__empty">You haven't asked Dan anything yet. Open the chat in the corner to start.</p>
        ) : (
          <ul className="profile__searches">
            {searches.map((s, i) => (
              <li key={`${s.at}-${i}`}>
                <p className="profile__search-text">“{s.text}”</p>
                <p className="profile__search-meta">
                  {formatDate(s.at, true)} · {pageLabel(s.page_path)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="profile__section" data-reveal="up" aria-labelledby="profile-viewed">
        <div className="profile__section-head">
          <h2 id="profile-viewed">Recently viewed</h2>
          {viewed.length > 0 && (
            <button
              type="button"
              className="profile__btn profile__btn--ghost profile__btn--small"
              disabled={busy !== null}
              onClick={() => run('views', clearViewHistory)}
            >
              {busy === 'views' ? 'Clearing…' : 'Clear'}
            </button>
          )}
        </div>
        {viewed.length === 0 ? (
          <p className="profile__empty">
            Nothing yet. <Link to="/products">Browse the shop</Link> and items you open will show up here.
          </p>
        ) : (
          <div className="profile__grid">
            {viewed.map((p) => (
              <ProductCard key={p.product_id} product={p} compact />
            ))}
          </div>
        )}
      </section>

      <section className="profile__section" data-reveal="up" aria-labelledby="profile-picks">
        <div className="profile__section-head">
          <h2 id="profile-picks">Picked for you by Dan</h2>
        </div>
        {picks.length === 0 ? (
          <p className="profile__empty">When Dan suggests products in chat, they'll be saved here.</p>
        ) : (
          <div className="profile__grid">
            {picks.map((p) => (
              <ProductCard key={p.product_id} product={p} compact />
            ))}
          </div>
        )}
      </section>

      <section className="profile__section" data-reveal="up" aria-labelledby="profile-purchases">
        <div className="profile__section-head">
          <h2 id="profile-purchases">Purchases</h2>
        </div>
        {purchases.length === 0 ? (
          <div className="profile__empty profile__empty--box">
            <p>{purchases_note}</p>
            <Link to="/visit" className="profile__btn profile__btn--small">
              Visit the store
            </Link>
          </div>
        ) : (
          <div className="profile__grid">
            {purchases.map((p) => (
              <ProductCard key={p.product_id} product={p} compact />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
