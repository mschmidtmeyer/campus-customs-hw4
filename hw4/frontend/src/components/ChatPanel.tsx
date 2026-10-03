import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, matchPath, useLocation, useNavigate, type Location } from 'react-router-dom'
import { ApiError, clearChatHistory, fetchChatHistory, fetchChatWelcome, fetchDanFacts, sendChatMessage } from '../api'
import { useAuth } from '../auth/authContext'
import { useSeason, type Season } from '../season/seasonContext'
import type { ChatTurn, DanFact, PageContext, PageResults, Product, User } from '../types'
import './ChatPanel.css'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Matching products to render as cards under an assistant reply (reserved for the real API). */
  products?: Product[]
}

export interface ChatReply {
  content: string
  products?: Product[]
  /** Set when the shopper asked to browse a type of item: the page shows these results. */
  pageResults?: PageResults | null
}

const SMALL_SCREEN = '(max-width: 520px)'

/** URL of the products page in "chat results" mode. */
function chatResultsUrl({ label, product_ids }: PageResults): string {
  return `/products?ids=${encodeURIComponent(product_ids.join(','))}&chat=${encodeURIComponent(label)}`
}

/**
 * CSS-only Handsome Dan bulldog face (no image assets). Size it with `font-size`.
 * He blinks on his own; pass `season` for his seasonal accessory (winter scarf,
 * spring flower, summer shades, fall maple leaf) and add `dan-face--wag` to make him wag.
 */
export function HandsomeDanFace({ className = '', season }: { className?: string; season?: Season }) {
  return (
    <span className={`dan-face ${className}`.trim()} aria-hidden="true">
      <span className="dan-face__ear dan-face__ear--l" />
      <span className="dan-face__ear dan-face__ear--r" />
      <span className="dan-face__head" />
      <span className="dan-face__brow" />
      <span className="dan-face__eye dan-face__eye--l" />
      <span className="dan-face__eye dan-face__eye--r" />
      <span className="dan-face__jowl dan-face__jowl--l" />
      <span className="dan-face__jowl dan-face__jowl--r" />
      <span className="dan-face__nose" />
      <span className="dan-face__collar" />
      {season && <span className={`dan-face__acc dan-face__acc--${season}`} />}
      <span className="dan-face__tag">Y</span>
    </span>
  )
}

/** Suggested questions under the chat; the wishlist one is added for signed-in shoppers. */
const QUICK_REPLIES = ["What's in season?", 'Gift ideas', 'Fun fact about Handsome Dan', 'Show me hoodies']
const WISHLIST_REPLY = "What's on my wishlist?"

/** Generic wording reused for unexpected/network failures (matches the catch in send()). */
const GENERIC_FAILURE = 'Sorry — something went wrong. Please try again in a moment.'

/** Page context for the backend: path, plus product id or listing query where relevant. */
function pageContext(location: Location): PageContext {
  const path = location.pathname
  const detail = matchPath('/products/:productId', path)
  return {
    path,
    product_id: detail?.params.productId ?? null,
    query: path === '/products' && location.search.length > 1 ? location.search.slice(1) : null,
  }
}

/** Guest history: last 6 non-welcome messages, each trimmed to 500 chars. */
function guestHistory(history: ChatMessage[]): ChatTurn[] {
  return history
    .filter((m) => m.id !== 'welcome')
    .slice(-6)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 500) }))
}

/**
 * Calls the backend chat agent. `history` is every message before `text`
 * (welcome message included); it is only sent for guests — the server loads
 * signed-in users' saved history itself. ApiErrors become friendly, status-specific
 * replies so the user never sees a raw error; unexpected failures re-throw to
 * reuse the fallback in send(), keeping errors reported exactly once.
 */
async function getReply(
  text: string,
  history: ChatMessage[],
  page: PageContext,
  signedIn: boolean,
): Promise<ChatReply> {
  try {
    return await sendChatMessage(text, page, signedIn ? undefined : guestHistory(history))
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 429) {
        // The server says which limit was hit (per-minute vs. daily budget); show its words.
        return { content: err.message || "I'm getting a lot of questions right now — give me a few seconds and try again." }
      }
      if (err.status === 503) {
        return { content: "I'm having trouble reaching the shop assistant right now. You can still browse /products." }
      }
      return { content: GENERIC_FAILURE }
    }
    throw err
  }
}

const GUEST_WELCOME =
  "Woof! I'm Handsome Dan, the Campus Customs assistant. Ask me about Yale hoodies, crewnecks, sizing or our shop on Broadway.\nSign in and I'll remember our chats."

function welcomeText(user: User | null): string {
  if (!user) return GUEST_WELCOME
  const name = user.first_name?.trim()
  return `Welcome back${name ? `, ${name}` : ''}! I'm Handsome Dan. Ask me about Yale gear, sizes, or our shop on Broadway.`
}

/** The welcome bubble; its text is filled in at render time from the auth state. */
const WELCOME: ChatMessage = { id: 'welcome', role: 'assistant', content: '' }

const welcomeKey = (userId: number) => `cc-welcome-${userId}`

let counter = 0
const newId = () => `m${Date.now().toString(36)}${(counter++).toString(36)}`

/** Turns "/products" mentions into router links; keeps everything else as plain text. */
// Internal site paths the assistant may mention. Longest alternatives first so
// "/products/<id>" wins over "/products", and "/account/password" over nothing.
const ROUTE = String.raw`/(?:products(?:/[A-Za-z0-9-]+)?|about|visit|size-guide|login|create-account|forgot-password|account/password|profile|bag|checkout)`
// Markdown link [label](/path), or a bare internal path. Trailing punctuation is left out.
const LINK_RE = new RegExp(String.raw`\[([^\]]+)\]\((${ROUTE})\)|(${ROUTE})`, 'g')

/** Renders assistant text, turning internal links — markdown [label](/path) or a bare
 *  /path — into router links. Everything else stays plain text. */
function MessageText({ text }: { text: string }) {
  const nodes: ReactNode[] = []
  let last = 0
  let key = 0
  for (const m of text.matchAll(LINK_RE)) {
    const start = m.index ?? 0
    if (start > last) nodes.push(<span key={key++}>{text.slice(last, start)}</span>)
    const to = m[2] ?? m[3] // markdown target, else the bare path
    const label = m[1] ?? m[3] // markdown label, else the path itself
    nodes.push(
      <Link key={key++} to={to}>
        {label}
      </Link>,
    )
    last = start + m[0].length
  }
  if (last < text.length) nodes.push(<span key={key++}>{text.slice(last)}</span>)
  return <>{nodes}</>
}

function ProductMiniCards({ products }: { products: Product[] }) {
  return (
    <ul className="chat-products">
      {products.map((p) => (
        <li key={p.product_id}>
          <Link to={`/products/${p.product_id}`} className="chat-product">
            <img src={p.image_url} alt="" loading="lazy" />
            <span>
              <span className="chat-product__name">{p.name}</span>
              <span className="chat-product__price">${p.price.toFixed(2)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export default function ChatPanel() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME])
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)

  const panelId = useId()
  const titleId = useId()
  const launcherRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { season } = useSeason()
  const userId = user?.id ?? null
  const prevUserId = useRef<number | null | undefined>(undefined)
  const [wagging, setWagging] = useState(false)
  const wagTimer = useRef<number | undefined>(undefined)
  const lastReplyId = useRef<string | null>(null)
  const [facts, setFacts] = useState<DanFact[]>([])
  const [factIndex, setFactIndex] = useState(0)

  // Handsome Dan wags when a new reply arrives (not for restored history).
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'assistant' || !last.id.startsWith('m') || last.id === lastReplyId.current) return
    lastReplyId.current = last.id
    setWagging(true)
    window.clearTimeout(wagTimer.current)
    wagTimer.current = window.setTimeout(() => setWagging(false), 1000)
  }, [messages])
  useEffect(() => () => window.clearTimeout(wagTimer.current), [])

  // "Did you know?" facts: loaded when the chat opens; retried on the next open if the
  // endpoint is missing (it 404s until the backend restarts). Errors are ignored.
  useEffect(() => {
    if (!open || facts.length > 0) return
    let cancelled = false
    fetchDanFacts()
      .then((list) => {
        if (cancelled || list.length === 0) return
        setFacts(list)
        setFactIndex(Math.floor(Math.random() * list.length))
      })
      .catch(() => {
        /* no card this time */
      })
    return () => {
      cancelled = true
    }
  }, [open, facts.length])
  const fact = facts.length > 0 ? facts[factIndex % facts.length] : null
  const anotherFact = () => {
    if (facts.length < 2) return
    setFactIndex((factIndex + 1 + Math.floor(Math.random() * (facts.length - 1))) % facts.length)
  }

  // Customer memory: load saved chat + personal greeting on sign-in; reset on sign-out.
  useEffect(() => {
    const prev = prevUserId.current
    prevUserId.current = userId
    if (userId === null) {
      if (prev !== undefined && prev !== null) setMessages([WELCOME])
      return
    }
    if (prev === userId) return
    let cancelled = false
    setMessages([WELCOME])
    void (async () => {
      try {
        const saved = await fetchChatHistory()
        if (cancelled || !saved) return
        const restored: ChatMessage[] = saved.map((m) => ({
          id: `h${m.id}`,
          role: m.role,
          content: m.content,
          products: m.products,
        }))
        // Keep anything typed while history was loading after the restored messages.
        setMessages((cur) => [WELCOME, ...restored, ...cur.filter((m) => m.id !== 'welcome')])
      } catch {
        // History is a nice-to-have; the chat still works without it.
      }
      try {
        let shown = false
        try {
          shown = sessionStorage.getItem(welcomeKey(userId)) !== null
        } catch {
          /* storage unavailable */
        }
        if (cancelled || shown) return
        const welcome = await fetchChatWelcome()
        if (cancelled || !welcome?.greeting) return
        try {
          sessionStorage.setItem(welcomeKey(userId), '1')
        } catch {
          /* storage unavailable */
        }
        setMessages((cur) => [
          ...cur,
          { id: newId(), role: 'assistant', content: welcome.greeting ?? '', products: welcome.products },
        ])
        setOpen(true) // Handsome Dan pops out.
      } catch {
        // Ignore: no personalised greeting this time.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  const forgetChats = useCallback(async () => {
    if (!window.confirm('Erase your saved chat history with Handsome Dan?')) return
    try {
      await clearChatHistory()
      setMessages([WELCOME])
    } catch {
      setMessages((m) => [
        ...m,
        { id: newId(), role: 'assistant', content: "Sorry — I couldn't erase our chats just now. Please try again." },
      ])
    }
  }, [])

  // Focus management: textarea on open, launcher on close.
  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true })
    else if (wasOpen.current) launcherRef.current?.focus({ preventScroll: true })
    wasOpen.current = open
  }, [open])

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, thinking, open])

  /** Sends `raw` (typed draft or a quick-reply chip) through the chat agent. */
  const sendText = useCallback(async (raw: string, fromDraft = false) => {
    const text = raw.trim()
    if (!text || thinking) return
    const history = messages
    setMessages((m) => [...m, { id: newId(), role: 'user', content: text }])
    if (fromDraft) setDraft('')
    setThinking(true)
    try {
      const { pageResults, ...reply } = await getReply(text, history, pageContext(location), userId !== null)
      setMessages((m) => [...m, { id: newId(), role: 'assistant', ...reply }])
      if (pageResults && pageResults.product_ids.length > 0) {
        navigate(chatResultsUrl(pageResults))
        // On phones the panel is fullscreen: close it so the results are visible.
        if (window.matchMedia(SMALL_SCREEN).matches) setOpen(false)
      }
    } catch {
      setMessages((m) => [
        ...m,
        { id: newId(), role: 'assistant', content: 'Sorry — something went wrong. Please try again in a moment.' },
      ])
    } finally {
      setThinking(false)
      inputRef.current?.focus()
    }
  }, [thinking, messages, navigate, location, userId])

  const send = useCallback(() => sendText(draft, true), [sendText, draft])

  function onInputKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send()
    }
  }

  function onPanelKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <>
      {open && (
        <div
          id={panelId}
          className="chat-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          onKeyDown={onPanelKey}
        >
          <header className="chat-panel__header">
            <span className="chat-panel__avatar" aria-hidden="true">
              <HandsomeDanFace season={season} className={wagging ? 'dan-face--wag' : ''} />
            </span>
            <div>
              <h2 id={titleId}>Handsome Dan</h2>
              <p>Usually replies instantly</p>
              {user && (
                <button type="button" className="chat-panel__forget" onClick={() => void forgetChats()}>
                  Forget my chats
                </button>
              )}
            </div>
            <button
              type="button"
              className="chat-panel__close"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
            >
              <span aria-hidden="true">×</span>
            </button>
          </header>

          <div
            className="chat-panel__messages"
            ref={listRef}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            onClick={(e) => {
              // On phones the panel is fullscreen: close it when a product link is followed.
              if ((e.target as HTMLElement).closest('a') && window.matchMedia(SMALL_SCREEN).matches) {
                setOpen(false)
              }
            }}
          >
            {messages.map((m) => (
              <div key={m.id} className={`chat-msg chat-msg--${m.role}`}>
                <span className="visually-hidden">{m.role === 'user' ? 'You said:' : 'Assistant said:'}</span>
                <div className="chat-msg__bubble">
                  <MessageText text={m.id === 'welcome' ? welcomeText(user) : m.content} />
                </div>
                {m.role === 'assistant' && m.products && m.products.length > 0 && (
                  <ProductMiniCards products={m.products} />
                )}
                {m.id === 'welcome' && fact && (
                  <div className="chat-fact">
                    <p className="chat-fact__title">
                      <HandsomeDanFace className="chat-fact__dan" />
                      Did you know?
                    </p>
                    <p className="chat-fact__text">{fact.text}</p>
                    {facts.length > 1 && (
                      <button type="button" className="chat-fact__more" onClick={anotherFact}>
                        Another fact
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {thinking && (
              <div className="chat-msg chat-msg--assistant" aria-label="Assistant is typing">
                <div className="chat-msg__bubble chat-typing" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>

          <div className="chat-chips" role="group" aria-label="Quick questions">
            {(user ? [...QUICK_REPLIES, WISHLIST_REPLY] : QUICK_REPLIES).map((q) => (
              <button key={q} type="button" className="chat-chip" disabled={thinking} onClick={() => void sendText(q)}>
                {q}
              </button>
            ))}
          </div>

          <form
            className="chat-panel__composer"
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
          >
            <label htmlFor={`${panelId}-input`} className="visually-hidden">
              Message the assistant
            </label>
            <textarea
              id={`${panelId}-input`}
              ref={inputRef}
              rows={2}
              value={draft}
              placeholder="Ask about sizes, prices, styles…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onInputKey}
            />
            <button type="submit" className="chat-panel__send" disabled={!draft.trim() || thinking} aria-label="Send message">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                <path d="M3 20.5 21 12 3 3.5l.01 6.6L15 12 3.01 13.9z" fill="currentColor" />
              </svg>
            </button>
          </form>
          <p className="chat-panel__hint">Enter to send · Shift+Enter for a new line</p>
        </div>
      )}

      <button
        ref={launcherRef}
        type="button"
        className={open ? 'chat-launcher chat-launcher--open' : 'chat-launcher'}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={open ? 'Close chat with Handsome Dan' : 'Chat with Handsome Dan'}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        ) : (
          <HandsomeDanFace season={season} className={`chat-launcher__dan${wagging ? ' dan-face--wag' : ''}`} />
        )}
      </button>
    </>
  )
}
