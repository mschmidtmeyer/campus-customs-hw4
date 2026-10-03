import type {
  Activity,
  DanFact,
  LookbookEntry,
  BagLineInput,
  CheckoutAddress,
  CheckoutContact,
  CheckoutReview,
  Fulfillment,
  PricedLine,
  Size,
  ChatHistoryMessage,
  ChatTurn,
  ChatWelcome,
  FilterOptions,
  PageContext,
  PageResults,
  Product,
  ProductQuery,
  RegisterInput,
  User,
  WishlistEntry,
} from './types'

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res.json() as Promise<T>
}

export function fetchProducts(query: ProductQuery = {}, signal?: AbortSignal): Promise<Product[]> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '' && value !== false) params.set(key, String(value))
  }
  const qs = params.toString()
  return getJson<Product[]>(`/api/products${qs ? `?${qs}` : ''}`, signal)
}

export function fetchProduct(productId: string): Promise<Product> {
  return getJson<Product>(`/api/products/${encodeURIComponent(productId)}`)
}

export function fetchFilters(): Promise<FilterOptions> {
  return getJson<FilterOptions>('/api/filters')
}

// --------------------------------------------------------------------------
// Accounts (backend/auth.py). The session lives in an HttpOnly cookie.
// --------------------------------------------------------------------------

/** Error from the API, with per-field messages when the server sent them. */
export class ApiError extends Error {
  status: number
  fieldErrors: Record<string, string[]>

  constructor(status: number, message: string, fieldErrors: Record<string, string[]> = {}) {
    super(message)
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

async function sendJson<T>(url: string, body?: unknown, method: 'POST' | 'DELETE' = 'POST'): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = data?.detail
    if (detail && typeof detail === 'object' && detail.errors) {
      throw new ApiError(res.status, 'Please fix the highlighted fields.', detail.errors)
    }
    throw new ApiError(res.status, typeof detail === 'string' ? detail : 'Something went wrong. Please try again.')
  }
  return data as T
}

/** A user plus the one-time plaintext recovery codes (register / change / reset only). */
export type UserWithCodes = User & { recovery_codes: string[] | null }

export function registerAccount(input: RegisterInput): Promise<UserWithCodes> {
  return sendJson<UserWithCodes>('/api/auth/register', input)
}

export function loginAccount(email: string, password: string): Promise<User> {
  return sendJson<User>('/api/auth/login', { email, password })
}

export function logoutAccount(): Promise<void> {
  return sendJson<void>('/api/auth/logout')
}

/** Current user, or null when not logged in. */
export async function fetchMe(): Promise<User | null> {
  const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
  if (res.status === 401) return null
  if (!res.ok) throw new ApiError(res.status, 'Could not check your sign-in.')
  return res.json() as Promise<User>
}

export function changePassword(currentPassword: string, newPassword: string): Promise<UserWithCodes> {
  return sendJson<UserWithCodes>('/api/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  })
}

/** Reset a forgotten password with a single-use recovery code; signs the user in. */
export function resetPassword(email: string, code: string, newPassword: string): Promise<UserWithCodes> {
  return sendJson<UserWithCodes>('/api/auth/reset-password', { email, code, new_password: newPassword })
}

/** Replace all recovery codes (needs the current password). Returns the new codes once. */
export async function regenerateRecoveryCodes(currentPassword: string): Promise<string[]> {
  const data = await sendJson<{ recovery_codes: string[] }>('/api/auth/regenerate-recovery-codes', {
    current_password: currentPassword,
  })
  return data.recovery_codes
}

// --------------------------------------------------------------------------
// Chat agent (backend POST /api/chat).
// --------------------------------------------------------------------------

/**
 * Product shape returned by the chat agent. A subset of the frontend `Product`:
 * it omits `description`, `search_tags` and `image_file_path`.
 */
interface ProductCard {
  product_id: string
  name: string
  garment_type: string
  price: number
  image_url: string
  total_stock: number
  colors: string[]
  inventory: Product['inventory']
}

interface ChatResponse {
  content: string
  products: ProductCard[]
  page_results?: PageResults | null
}

/** Fill in the fields a ProductCard lacks so it satisfies the frontend `Product` type. */
function cardToProduct(card: ProductCard): Product {
  return {
    ...card,
    description: '',
    search_tags: [],
    // ProductCard only carries the public image URL; derive a file path from it.
    image_file_path: card.image_url.replace(/^\/media\//, ''),
  }
}

export async function sendChatMessage(
  message: string,
  page: PageContext,
  history?: ChatTurn[],
): Promise<{ content: string; products: Product[]; pageResults: PageResults | null }> {
  const body: { message: string; page: PageContext; history?: ChatTurn[] } = { message, page }
  if (history) body.history = history
  const data = await sendJson<ChatResponse>('/api/chat', body)
  const page_results = data.page_results
  return {
    content: data.content,
    products: (data.products ?? []).map(cardToProduct),
    pageResults:
      page_results && Array.isArray(page_results.product_ids) && page_results.product_ids.length > 0
        ? { label: page_results.label ?? '', product_ids: page_results.product_ids }
        : null,
  }
}

/** Signed-in GET helper: returns null for guests (401). */
async function getAuthedJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { credentials: 'same-origin' })
  if (res.status === 401) return null
  if (!res.ok) throw new ApiError(res.status, `Request failed: ${res.status}`)
  return res.json() as Promise<T>
}

interface ChatHistoryResponse {
  messages: (Omit<ChatHistoryMessage, 'products'> & { products?: ProductCard[] })[]
}

/** The signed-in user's saved chat (oldest first), or null for guests. */
export async function fetchChatHistory(): Promise<ChatHistoryMessage[] | null> {
  const data = await getAuthedJson<ChatHistoryResponse>('/api/chat/history')
  if (!data) return null
  return (data.messages ?? []).map((m) => ({ ...m, products: (m.products ?? []).map(cardToProduct) }))
}

/** Personalised welcome for returning users, or null for guests. */
export async function fetchChatWelcome(): Promise<ChatWelcome | null> {
  const data = await getAuthedJson<{ greeting: string | null; products?: ProductCard[] }>('/api/chat/welcome')
  if (!data) return null
  return { greeting: data.greeting ?? null, products: (data.products ?? []).map(cardToProduct) }
}

/** Erase the signed-in user's saved chat history. */
export function clearChatHistory(): Promise<void> {
  return sendJson<void>('/api/chat/history', undefined, 'DELETE')
}

// --------------------------------------------------------------------------
// My Profile (backend/activity.py)
// --------------------------------------------------------------------------

/** Record that the signed-in shopper opened a product. Fire-and-forget; guests are ignored server-side. */
export function recordProductView(productId: string): void {
  void fetch('/api/me/views', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: productId }),
  }).catch(() => undefined)
}

/** Profile + activity for the signed-in shopper, or null for guests. */
export async function fetchActivity(): Promise<Activity | null> {
  const data = await getAuthedJson<
    Omit<Activity, 'viewed' | 'recommended_from_chat' | 'purchases'> & {
      viewed?: (ProductCard & { viewed_at: string })[]
      recommended_from_chat?: ProductCard[]
      purchases?: ProductCard[]
    }
  >('/api/me/activity')
  if (!data) return null
  return {
    ...data,
    viewed: (data.viewed ?? []).map((c) => ({ ...cardToProduct(c), viewed_at: c.viewed_at })),
    recommended_from_chat: (data.recommended_from_chat ?? []).map(cardToProduct),
    purchases: (data.purchases ?? []).map(cardToProduct),
  }
}

/** Clear the signed-in shopper's recently-viewed list. */
export function clearViewHistory(): Promise<void> {
  return sendJson<void>('/api/me/views', undefined, 'DELETE')
}

// --------------------------------------------------------------------------
// Wishlist (backend/wishlist.py) — signed-in only.
// --------------------------------------------------------------------------

interface WishlistResponse {
  items: { product: ProductCard; added_at: string }[]
}

function wishlistFromResponse(data: WishlistResponse | null | undefined): WishlistEntry[] {
  return (data?.items ?? []).map((i) => ({ product: cardToProduct(i.product), added_at: i.added_at }))
}

/** Saved products (live price/stock), newest first; null for guests. */
export async function fetchWishlist(): Promise<WishlistEntry[] | null> {
  const data = await getAuthedJson<WishlistResponse>('/api/wishlist')
  return data ? wishlistFromResponse(data) : null
}

/** Save a product. Idempotent; returns the updated list. */
export async function addToWishlist(productId: string): Promise<WishlistEntry[]> {
  return wishlistFromResponse(await sendJson<WishlistResponse>('/api/wishlist', { product_id: productId }))
}

export function removeFromWishlist(productId: string): Promise<void> {
  return sendJson<void>(`/api/wishlist/${encodeURIComponent(productId)}`, undefined, 'DELETE')
}

// --------------------------------------------------------------------------
// Bag + test-mode checkout (backend/cart.py). Signed-in only, except review.
// --------------------------------------------------------------------------

interface ServerLine extends Omit<PricedLine, 'product'> {
  product: ProductCard | null
}

export interface ServerCart {
  items: PricedLine[]
  item_count: number
  subtotal: number
  skipped?: string[]
}

function mapCart(data: { items: ServerLine[]; item_count: number; subtotal: number; skipped?: string[] }): ServerCart {
  return { ...data, items: data.items.map((l) => ({ ...l, product: l.product ? cardToProduct(l.product) : null })) }
}

async function cartRequest(url: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<ServerCart> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = data?.detail
    throw new ApiError(res.status, typeof detail === 'string' ? detail : 'Could not update your bag. Please try again.')
  }
  return mapCart(data)
}

export const fetchCart = () => cartRequest('/api/cart', 'GET')
export const addCartItem = (line: BagLineInput) => cartRequest('/api/cart/items', 'POST', line)
export const setCartItem = (line: BagLineInput) => cartRequest('/api/cart/items', 'PATCH', line)
export const removeCartItem = (productId: string, size: Size) =>
  cartRequest(`/api/cart/items?product_id=${encodeURIComponent(productId)}&size=${size}`, 'DELETE')
export const clearCart = () => cartRequest('/api/cart', 'DELETE')
export const mergeCart = (items: BagLineInput[]) => cartRequest('/api/cart/merge', 'POST', { items: items.slice(0, 50) })

export async function reviewCheckout(body: {
  fulfillment: Fulfillment
  contact: CheckoutContact
  address?: CheckoutAddress
  items?: BagLineInput[]
}): Promise<CheckoutReview> {
  const data = await sendJson<Omit<CheckoutReview, 'lines'> & { lines: ServerLine[] }>('/api/checkout/review', body)
  return { ...data, lines: data.lines.map((l) => ({ ...l, product: l.product ? cardToProduct(l.product) : null })) }
}

// --------------------------------------------------------------------------
// Handsome Dan facts, seasonal picks and the lookbook (Worker I)
// --------------------------------------------------------------------------

/** Handsome Dan trivia for the chat's "Did you know?" card. Throws on HTTP errors. */
export async function fetchDanFacts(): Promise<DanFact[]> {
  const data = await getJson<{ facts?: DanFact[] }>('/api/dan/facts')
  return (Array.isArray(data?.facts) ? data.facts : []).filter(
    (f): f is DanFact => !!f && typeof f.text === 'string' && f.text.trim() !== '',
  )
}

/** Live, in-stock picks for any season (GET /api/season?season=…). Throws on HTTP errors. */
export async function fetchSeasonPicks(season: string, signal?: AbortSignal): Promise<Product[]> {
  const data = await getJson<{ picks?: Product[] }>(`/api/season?season=${encodeURIComponent(season)}`, signal)
  return Array.isArray(data?.picks) ? data.picks : []
}

/** AI-generated lookbook photos (public/lookbook/lookbook.json); [] when missing or malformed. */
export async function fetchLookbook(signal?: AbortSignal): Promise<LookbookEntry[]> {
  try {
    const data = await getJson<unknown>('/lookbook/lookbook.json', signal)
    if (!Array.isArray(data)) return []
    return data.filter(
      (e): e is LookbookEntry =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as LookbookEntry).file === 'string' &&
        typeof (e as LookbookEntry).product_id === 'string',
    )
  } catch {
    return []
  }
}
