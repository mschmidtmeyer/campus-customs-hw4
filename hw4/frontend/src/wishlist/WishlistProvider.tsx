import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { addToWishlist, fetchWishlist, removeFromWishlist } from '../api'
import { useAuth } from '../auth/authContext'
import type { WishlistEntry } from '../types'
import { WishlistContext, type WishlistState } from './wishlistContext'

/** Server-backed wishlist for signed-in shoppers. Guests are sent to /login on toggle. */
export default function WishlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Data is tagged with the user it belongs to, so a sign-out (or account switch)
  // hides the previous shopper's list immediately without an effect.
  const [owned, setOwned] = useState<{ owner: number | null; items: WishlistEntry[]; ids: Set<string> }>(() => ({
    owner: null,
    items: [],
    ids: new Set(),
  }))
  const [error, setError] = useState<string | null>(null)
  const userId = user?.id ?? null
  const mine = userId !== null && owned.owner === userId
  const items = useMemo(() => (mine ? owned.items : []), [mine, owned.items])
  const ids = useMemo(() => (mine ? owned.ids : new Set<string>()), [mine, owned.ids])
  const idsRef = useRef(ids)
  useEffect(() => {
    idsRef.current = ids
  }, [ids])

  const apply = useCallback(
    (entries: WishlistEntry[]) =>
      setOwned({ owner: userId, items: entries, ids: new Set(entries.map((e) => e.product.product_id)) }),
    [userId],
  )
  const setIds = useCallback((next: Set<string>) => setOwned((cur) => ({ ...cur, owner: userId, ids: next })), [userId])
  const setItems = useCallback(
    (fn: (cur: WishlistEntry[]) => WishlistEntry[]) => setOwned((cur) => ({ ...cur, items: fn(cur.items) })),
    [],
  )

  const refresh = useCallback(async () => {
    if (userId === null) return
    try {
      const entries = await fetchWishlist()
      apply(entries ?? [])
      setError(null)
    } catch {
      setError('Could not load your wishlist.')
    }
  }, [userId, apply])

  useEffect(() => {
    if (userId === null) return
    let cancelled = false
    fetchWishlist()
      .then((entries) => {
        if (cancelled) return
        apply(entries ?? [])
        setError(null)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your wishlist.')
      })
    return () => {
      cancelled = true
    }
  }, [userId, apply])

  const toggle = useCallback(
    async (productId: string) => {
      if (userId === null) {
        navigate('/login', { state: { from: location.pathname + location.search } })
        return
      }
      const wasSaved = idsRef.current.has(productId)
      const prevIds = idsRef.current
      const next = new Set(prevIds)
      if (wasSaved) next.delete(productId)
      else next.add(productId)
      idsRef.current = next
      setIds(next) // optimistic
      if (wasSaved) setItems((cur) => cur.filter((e) => e.product.product_id !== productId))
      try {
        if (wasSaved) await removeFromWishlist(productId)
        else apply(await addToWishlist(productId))
        setError(null)
      } catch (e) {
        idsRef.current = prevIds
        setIds(prevIds) // rollback
        setError(e instanceof Error ? e.message : 'Could not update your wishlist.')
        void refresh()
      }
    },
    [userId, navigate, location.pathname, location.search, apply, refresh, setIds, setItems],
  )

  const value = useMemo<WishlistState>(
    () => ({
      ids,
      loading: userId !== null && !mine && error === null, // first load for this shopper
      has: (id: string) => ids.has(id),
      toggle,
      refresh,
      items,
      error: userId !== null ? error : null,
    }),
    [ids, mine, toggle, refresh, items, error, userId],
  )
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}
