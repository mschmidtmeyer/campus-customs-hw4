// Shared API contract with backend/main.py. Keep in sync.

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const
export type Size = (typeof SIZES)[number]

export interface StockLine {
  size: Size
  quantity: number
}

/** Same shape as the items stored in chat_messages.products_json. */
export interface Product {
  product_id: string
  name: string
  garment_type: string
  description: string
  colors: string[]
  search_tags: string[]
  image_file_path: string
  image_url: string // e.g. /media/products/basic-hoodie-big-yale.jpg
  price: number
  inventory: StockLine[] // always XS..XXL order
  total_stock: number
}

/** GET /api/filters */
export interface FilterOptions {
  garment_types: string[]
  colors: string[]
  sizes: Size[]
  price_min: number
  price_max: number
}

/** Query params accepted by GET /api/products (all optional). */
export interface ProductQuery {
  q?: string // matches name, description, search_tags (case-insensitive)
  garment_type?: string
  color?: string
  size?: Size // only products with quantity > 0 in this size
  min_price?: number
  max_price?: number
  in_stock?: boolean // total_stock > 0
  sort?: 'name' | 'price_asc' | 'price_desc'
  ids?: string // comma-separated product_ids; results keep this order
}

/** Logged-in shopper, from /api/auth/* (backend/auth.py). */
export interface User {
  id: number
  name: string
  first_name: string | null
  last_name: string | null
  email: string
  phone: string | null
  /** True for accounts still using an old, insecure password; the site asks them to change it. */
  password_needs_update: boolean
}

export interface RegisterInput {
  first_name: string
  last_name: string
  email: string
  phone: string
  password: string
}

/** Chat-driven search results: POST /api/chat `page_results`. */
export interface PageResults {
  label: string
  product_ids: string[]
}

/** Where the shopper is right now; sent with each chat message. */
export interface PageContext {
  path: string
  product_id?: string | null
  query?: string | null
}

/** One prior chat turn sent by guests (signed-in history lives on the server). */
export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

/** A saved chat message loaded from GET /api/chat/history (products already mapped). */
export interface ChatHistoryMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  products: Product[]
  created_at: string
}

/** Personalised greeting from GET /api/chat/welcome. */
export interface ChatWelcome {
  greeting: string | null
  products: Product[]
}

// --------------------------------------------------------------------------
// My Profile (backend/activity.py, GET /api/me/activity)
// --------------------------------------------------------------------------

export interface ProfileInfo {
  first_name: string | null
  last_name: string | null
  name: string
  email: string
  phone: string | null
  member_since: string | null
}

export interface ChatSearch {
  text: string
  at: string
  page_path: string | null
}

export interface Activity {
  profile: ProfileInfo
  searches: ChatSearch[]
  viewed: (Product & { viewed_at: string })[]
  recommended_from_chat: Product[]
  purchases: Product[]
  purchases_note: string
}

/** One saved product on the wishlist (product carries LIVE price/stock). */
export interface WishlistEntry {
  product: Product
  added_at: string
}

// --------------------------------------------------------------------------
// Bag + test-mode checkout (backend/cart.py)
// --------------------------------------------------------------------------

/** A bag line as the client sends it (no prices — the server prices everything). */
export interface BagLineInput {
  product_id: string
  size: Size
  quantity: number
}

export type Fulfillment = 'pickup' | 'ship'

export interface CheckoutContact {
  name: string
  email: string
  phone: string
}

export interface CheckoutAddress {
  line1: string
  line2?: string
  city: string
  state: string
  zip: string
}

/** One live-priced line from the server (cart or checkout review). */
export interface PricedLine {
  product_id: string
  size: Size
  quantity: number
  available: number
  product: Product | null
  line_total: number
  unit_price: number | null
}

/** POST /api/checkout/review — nothing is placed or charged. */
export interface CheckoutReview {
  lines: PricedLine[]
  subtotal: number
  shipping: number
  tax: number
  total: number
  problems: string[]
  fulfillment: Fulfillment
  payment_ready: false
  message: string
}

// --------------------------------------------------------------------------
// Handsome Dan facts + lookbook (Worker I)
// --------------------------------------------------------------------------

/** One fact from GET /api/dan/facts → { facts: DanFact[] }. */
export interface DanFact {
  id: number | string
  text: string
}

/** One AI-generated lookbook photo listed in public/lookbook/lookbook.json. */
export interface LookbookEntry {
  file: string // e.g. /lookbook/fall-2025-yale-vs-harvard-t-shirt.jpg
  product_id: string
  season: string // winter | spring | summer | fall
  title: string
  caption: string
  alt: string
}
