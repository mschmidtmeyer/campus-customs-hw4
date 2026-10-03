import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ApiError,
  addCartItem,
  clearCart,
  fetchCart,
  fetchProducts,
  mergeCart,
  removeCartItem,
  setCartItem,
  type ServerCart,
} from '../api'
import { useAuth } from '../auth/authContext'
import { SIZES, type BagLineInput, type Product, type Size } from '../types'
import { BagContext, type BagItem, type BagState } from './bagContext'

const STORAGE_KEY = 'cc-bag'
const MAX_QTY = 10
const MAX_LINES = 50

/** Guest bag in localStorage: only ids, sizes and quantities — never prices. */
function readLocal(): BagLineInput[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter(
        (l): l is BagLineInput =>
          !!l &&
          typeof l.product_id === 'string' &&
          (SIZES as readonly string[]).includes(l.size) &&
          Number.isInteger(l.quantity) &&
          l.quantity > 0,
      )
      .map((l) => ({ product_id: l.product_id, size: l.size, quantity: Math.min(l.quantity, MAX_QTY) }))
      .slice(0, MAX_LINES)
  } catch {
    return []
  }
}

function writeLocal(lines: BagLineInput[]) {
  try {
    if (lines.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage full or blocked: the bag just won't persist */
  }
}

function stockOf(product: Product | null | undefined, size: Size): number {
  return product?.inventory.find((s) => s.size === size)?.quantity ?? 0
}

function checkQty(product: Product, size: Size, qty: number) {
  const left = stockOf(product, size)
  if (left <= 0) throw new ApiError(409, `Sorry, ${product.name} is sold out in ${size}.`)
  if (qty > MAX_QTY) throw new ApiError(409, `You can have at most ${MAX_QTY} of one item in your bag.`)
  if (qty > left) throw new ApiError(409, `Only ${left} left in ${size}.`)
}

function fromServer(cart: ServerCart): BagItem[] {
  return cart.items.map((l) => ({
    product_id: l.product_id,
    size: l.size,
    quantity: l.quantity,
    product: l.product,
    available: l.available,
  }))
}

export default function BagProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const signedIn = !!user
  const [guestLines, setGuestLines] = useState<BagLineInput[]>(() => readLocal())
  const [products, setProducts] = useState<Record<string, Product | null>>({})
  const [serverItems, setServerItems] = useState<BagItem[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const prevUserId = useRef<number | null | undefined>(undefined)

  // ---- guest: load live product details for the ids in the bag ----
  const loadGuestProducts = useCallback(async (lines: BagLineInput[]) => {
    const ids = [...new Set(lines.map((l) => l.product_id))]
    if (!ids.length) return
    const list = await fetchProducts({ ids: ids.join(',') })
    setProducts((prev) => {
      const next = { ...prev }
      for (const id of ids) next[id] = list.find((p) => p.product_id === id) ?? null
      return next
    })
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      if (signedIn) setServerItems(fromServer(await fetchCart()))
      else await loadGuestProducts(guestLines)
    } catch {
      /* keep what we had; pages show their own errors */
    } finally {
      setLoading(false)
    }
  }, [signedIn, guestLines, loadGuestProducts])

  // ---- react to sign-in / sign-out (and merge a guest bag on sign-in) ----
  useEffect(() => {
    if (authLoading) return
    const uid = user?.id ?? null
    if (prevUserId.current === uid) return
    prevUserId.current = uid
    // No cancellation flag: a StrictMode re-run returns early above, so this run must finish.
    void (async () => {
      setLoading(true)
      try {
        if (uid !== null) {
          const local = readLocal()
          const cart = local.length ? await mergeCart(local) : await fetchCart()
          if (local.length) {
            writeLocal([])
            setGuestLines([])
            if (cart.skipped?.length) setNotice(cart.skipped.join(' '))
          }
          setServerItems(fromServer(cart))
        } else {
          setServerItems([])
          const local = readLocal()
          setGuestLines(local)
          await loadGuestProducts(local)
        }
      } catch {
        /* leave the bag as is */
      } finally {
        setLoading(false)
      }
    })()
  }, [authLoading, user?.id, loadGuestProducts])

  // Guest lines whose product details we haven't loaded yet (e.g. added in another tab).
  useEffect(() => {
    if (signedIn) return
    const missing = guestLines.filter((l) => !(l.product_id in products))
    if (missing.length) loadGuestProducts(missing).catch(() => undefined)
  }, [signedIn, guestLines, products, loadGuestProducts])

  // Keep guest bags in sync across tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && !signedIn) setGuestLines(readLocal())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [signedIn])

  const updateGuest = useCallback((next: BagLineInput[]) => {
    writeLocal(next)
    setGuestLines(next)
  }, [])

  /** Guest-side mirror of the server checks (the server re-checks at review). */
  const guestProduct = useCallback(
    async (productId: string): Promise<Product> => {
      let product = products[productId]
      if (product === undefined) {
        const [found] = await fetchProducts({ ids: productId })
        product = found ?? null
        setProducts((prev) => ({ ...prev, [productId]: product ?? null }))
      }
      if (!product) throw new ApiError(404, 'That product is no longer available.')
      return product
    },
    [products],
  )

  const add = useCallback(
    async (productId: string, size: Size, quantity = 1) => {
      if (signedIn) {
        setServerItems(fromServer(await addCartItem({ product_id: productId, size, quantity })))
        return
      }
      const product = await guestProduct(productId)
      const current = readLocal()
      const existing = current.find((l) => l.product_id === productId && l.size === size)
      const total = (existing?.quantity ?? 0) + quantity
      checkQty(product, size, total)
      if (!existing && current.length >= MAX_LINES) throw new ApiError(409, 'Your bag is full (50 lines).')
      updateGuest(
        existing
          ? current.map((l) => (l === existing ? { ...l, quantity: total } : l))
          : [...current, { product_id: productId, size, quantity }],
      )
    },
    [signedIn, guestProduct, updateGuest],
  )

  const remove = useCallback(
    async (productId: string, size: Size) => {
      if (signedIn) {
        setServerItems(fromServer(await removeCartItem(productId, size)))
        return
      }
      updateGuest(readLocal().filter((l) => !(l.product_id === productId && l.size === size)))
    },
    [signedIn, updateGuest],
  )

  const setQuantity = useCallback(
    async (productId: string, size: Size, quantity: number) => {
      if (quantity <= 0) return remove(productId, size)
      if (signedIn) {
        setServerItems(fromServer(await setCartItem({ product_id: productId, size, quantity })))
        return
      }
      const product = await guestProduct(productId)
      checkQty(product, size, quantity)
      updateGuest(readLocal().map((l) => (l.product_id === productId && l.size === size ? { ...l, quantity } : l)))
    },
    [signedIn, guestProduct, updateGuest, remove],
  )

  const clear = useCallback(async () => {
    if (signedIn) setServerItems(fromServer(await clearCart()))
    else updateGuest([])
  }, [signedIn, updateGuest])

  const items: BagItem[] = useMemo(() => {
    if (signedIn) return serverItems
    return guestLines.map((l) => {
      const product = products[l.product_id] ?? null
      return { ...l, product, available: products[l.product_id] === undefined ? l.quantity : stockOf(product, l.size) }
    })
  }, [signedIn, serverItems, guestLines, products])

  const value = useMemo<BagState>(
    () => ({
      items,
      count: items.reduce((n, i) => n + i.quantity, 0),
      subtotal:
        Math.round(items.reduce((sum, i) => sum + (i.product ? i.product.price * i.quantity : 0), 0) * 100) / 100,
      loading: loading || authLoading,
      add,
      setQuantity,
      remove,
      clear,
      refresh,
      signedIn,
      notice,
      dismissNotice: () => setNotice(null),
    }),
    [items, loading, authLoading, add, setQuantity, remove, clear, refresh, signedIn, notice],
  )
  return <BagContext.Provider value={value}>{children}</BagContext.Provider>
}
