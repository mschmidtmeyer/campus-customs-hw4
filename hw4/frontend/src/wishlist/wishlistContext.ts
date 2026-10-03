import { createContext, useContext } from 'react'
import type { WishlistEntry } from '../types'

export interface WishlistState {
  ids: Set<string> // product_ids on the signed-in shopper's wishlist
  loading: boolean
  has: (productId: string) => boolean
  toggle: (productId: string) => Promise<void> // guests: should send them to /login
  refresh: () => Promise<void>
  items: WishlistEntry[] // saved products with live price/stock, newest first
  error: string | null // last toggle/load error (cleared on success)
}

export const WishlistContext = createContext<WishlistState | null>(null)

export function useWishlist(): WishlistState {
  const ctx = useContext(WishlistContext)
  if (!ctx) throw new Error('useWishlist must be used inside <WishlistProvider>')
  return ctx
}
