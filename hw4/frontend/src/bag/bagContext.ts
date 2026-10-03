import { createContext, useContext } from 'react'
import type { Product, Size } from '../types'

/** One line in the shopping bag. `product` carries LIVE price/stock from the server. */
export interface BagItem {
  product_id: string
  size: Size
  quantity: number
  product: Product | null
  available: number // units in stock for this size right now
}

export interface BagState {
  items: BagItem[]
  count: number // total units
  subtotal: number // USD
  loading: boolean
  add: (productId: string, size: Size, quantity?: number) => Promise<void>
  setQuantity: (productId: string, size: Size, quantity: number) => Promise<void>
  remove: (productId: string, size: Size) => Promise<void>
  clear: () => Promise<void>
  refresh: () => Promise<void>
  /** Added by Worker E: true when the bag lives on the server (signed in). */
  signedIn?: boolean
  /** Message after a guest bag was merged on sign-in (e.g. a line was sold out). */
  notice?: string | null
  dismissNotice?: () => void
}

export const BagContext = createContext<BagState | null>(null)

export function useBag(): BagState {
  const ctx = useContext(BagContext)
  if (!ctx) throw new Error('useBag must be used inside <BagProvider>')
  return ctx
}
