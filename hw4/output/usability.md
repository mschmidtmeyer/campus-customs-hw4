# Campus Customs — Usability Improvements (Problem 9)

Each improvement lists **what I added**, **why it helps a Campus Customs shopper**, **why it helps the business**, and **where to see it** in the app (all verified running locally at http://localhost:5173).

They're grouped the way the work was split: **backend / agent** improvements (what the server and Handsome Dan do) and **frontend** improvements (what the shopper sees and touches). The two headline features of this round are one of each on both sides:

| | Backend / agent | Frontend |
|---|---|---|
| Feature 1 | **Bag + test checkout API** (`backend/cart.py`) | **Bag page + 3-step checkout** (`/bag`, `/checkout`) |
| Feature 2 | **Wishlist API + Dan's `get_wishlist` tool** (`backend/wishlist.py`) | **Hearts on every product + Wishlist in My Profile** |

---

## Backend / agent improvements

### 1. Bag and test-mode checkout (backend)
- **What:** A server-side bag for signed-in shoppers (`cart_items` table), a guest bag that merges into the account on sign-in, and a checkout review that re-checks live stock and calculates shipping (pickup free; ship $8, free over $100) and Connecticut sales tax (6.35%). It stops at payment: no order is created, no stock changes, and nobody is charged.
- **Shopper:** Can collect items across visits and devices, and sees an honest total — including "only 2 left in M" or "sold out" — before paying.
- **Business:** The full purchase funnel is ready; only a payment provider needs to be plugged in. Prices are always computed from the database, never trusted from the browser, so totals can't be tampered with.
- **See it:** add something to the bag on any product page → bag icon in the navbar → **Continue to checkout**.

### 2. Wishlist (backend + Handsome Dan)
- **What:** A `wishlist_items` table, `GET/POST/DELETE /api/wishlist`, and a new agent tool `get_wishlist`, so Dan can answer "what's on my wishlist?" or "is anything on my wishlist in stock in M?" with live stock.
- **Shopper:** Saves gifts and maybe-laters without buying, and can ask Dan about them in plain language.
- **Business:** A wishlist is a clear signal of demand — what people want but haven't bought — and a natural hook for future back-in-stock or price-drop messages.
- **See it:** heart a product → **My Profile → Wishlist**, or ask Dan "what's on my wishlist?".

### 3. Typo- and synonym-tolerant search (chatbot and product search)
- **What:** `backend/search.py` corrects misspellings against the catalogue's own vocabulary ("hooddies" → hoodie, "crewnek" → crewneck, "yael" → Yale, "tee" → t-shirt) and maps everyday color words to catalogue colors (pink → coral, grey → gray, beige → cream, maroon → red). It runs inside the one search function both the Products page and Dan use, in under 1 ms.
- **Shopper:** Finds what they meant even when typing fast on a phone; the page says "Showing results for 'hoodie' (you typed 'hooddies')".
- **Business:** Fewer "no results" dead ends means fewer lost sales. Honest about gaps: "pink hoodie" returns nothing because there is no coral hoodie, instead of showing the wrong color.
- **See it:** type `hooddies` or `grey` in the Products search box, or ask Dan "do u have pink stuff?".

### 4. Faster, cheaper Handsome Dan
- **What:** Lower reasoning effort and concise output for the model (the tools already supply exact prices, stock and counts), and a shorter replayed history (8 messages instead of 12).
- **Shopper:** Quicker replies (product search ~7.5 s → ~6.5 s; store hours ~4.0 s → ~3.6 s in testing).
- **Business:** Fewer tokens per conversation = lower AI cost, with the same accuracy because facts still come from tools.
- **See it:** chat with Dan.

### 5. Password recovery codes
- **What:** 8 single-use codes shown once whenever a password is set (sign-up, change, reset). Stored only as hashes. `/forgot-password` resets with email + code + new password; failed attempts get one generic message and are rate-limited.
- **Shopper:** Can get back into their account without email infrastructure or calling the store.
- **Business:** Fewer locked-out customers and support requests; no user enumeration, and brute-forcing codes is blocked.
- **See it:** create an account (codes screen), or **Login → Forgot your password?**; existing accounts: **Change password → Generate new recovery codes**.

### 6. Encrypted chat history
- **What:** Saved chat messages and their product lists are encrypted at rest (Fernet, `enc:v1:` prefix). The key lives in `backend/.env`, which is gitignored and readable only by the owner.
- **Shopper:** Their conversations with Dan stay private even if the database file were copied.
- **Business:** Reduces the damage of a leaked database file — a basic data-protection expectation for any store keeping customer conversations.
- **See it:** chat history still loads normally in the chat panel; in the DB, `chat_messages.content` starts with `enc:v1:`.

---

## Frontend improvements

### 7. Bag page and 3-step checkout (frontend)
- **What:** A bag icon with a live count in the navbar, **Add to bag** with size and quantity on every product page, a `/bag` page with quantity steppers and stock warnings, and `/checkout`: **1 Details** (pickup at 57 Broadway or shipping) → **2 Review** (live totals and problems) → **3 Payment (test mode)**, which shows where payment would go and clearly says the order was not placed. No card data is collected.
- **Shopper:** A familiar, predictable path to buy, with no surprises in the total.
- **Business:** Demonstrates the end-to-end funnel and where shoppers drop off; ready for a real payment provider.
- **See it:** product page → **Add to bag** → bag icon → checkout.

### 8. Wishlist hearts and My Profile sections
- **What:** A heart on every product card and product page (guests are sent to sign in), plus **Wishlist** and **Your bag** sections in My Profile.
- **Shopper:** One tap to save; everything they care about in one place.
- **Business:** Keeps shoppers coming back to their saved items.
- **See it:** hearts on `/products`; **My Profile**.

### 9. My Profile page
- **What:** `/profile` (navbar → **My Profile** when signed in): account details, past searches with Dan, recently viewed products (live price/stock), Dan's picks, wishlist, bag, and purchases (empty until real payment exists).
- **Shopper:** Picks up where they left off without remembering product names.
- **Business:** A home for repeat customers; the data that powers recommendations is visible and under the shopper's control ("Forget my chats", "Clear" viewed items).
- **See it:** sign in → **My Profile**.

### 10. Live search as you type
- **What:** The Products search box updates on every keystroke (120 ms debounce), cancels stale requests so results never jump backwards, and keeps the old results on screen while new ones load.
- **Shopper:** Instant feedback; they can stop typing as soon as the right item appears.
- **Business:** Faster discovery and more products seen per visit.
- **See it:** `/products` search box.

### 11. Dark mode
- **What:** Sun/moon toggle in the navbar, remembered per browser, defaults to the device setting, applied before the first paint (no flash). Every text/background pair was checked with a WCAG contrast script (body text ≥ 13:1 in both themes; form borders fixed from 1.3:1 to 3.5:1).
- **Shopper:** Comfortable browsing at night and on OLED phones; readable for everyone.
- **Business:** Modern expectation; accessibility reduces legal risk and widens the audience.
- **See it:** navbar toggle.

### 12. Apple-style reveal on scroll
- **What:** Sections fade and slide into view as you scroll (Home, About, Visit Us, Size Guide, Profile), staggered on product grids, with a light parallax on the home hero. Runs once per element, respects "reduce motion", and content stays visible if scripts fail.
- **Shopper:** The site feels polished and guides the eye down the page.
- **Business:** A premium feel that matches officially licensed Yale merchandise.
- **See it:** scroll the home page.

### 13. Real Handsome Dan logo and chat launcher
- **What:** A CSS-drawn English bulldog head (rose ears, jowls, underbite, Yale-blue collar with a "Y" tag) as the navbar logo, and a larger Dan face as the chat button.
- **Shopper:** Instantly recognizable, friendly entry point to help.
- **Business:** Stronger brand identity tied to Yale's mascot; no image assets to maintain.
- **See it:** top-left logo; bottom-right chat button.

### 14. Mobile-ready, installable
- **What:** 375 px layouts without sideways scrolling, 44 px tap targets, 16 px inputs (no iOS zoom), full-screen chat on phones, theme colors for the browser bar, and a web app manifest so the site can be added to the home screen.
- **Shopper:** Shops comfortably from a phone on campus.
- **Business:** Most student traffic is mobile; an installable icon keeps the store one tap away.
- **See it:** narrow the browser window, or use the browser's device mode (Cmd+Option+I → phone icon). The dev server only listens on this computer, so a real phone can't reach it yet.

---

## Verified in the running app

Checked against the live local app (backend restarted with all changes, test data removed afterwards):

| Improvement | Check | Result |
|---|---|---|
| Bag (backend) | Guest `GET /api/cart` | 401 (bag needs sign-in on the server; guests use a browser bag) |
| Bag (backend) | Test User adds Yale Dad Hoodie, M | 1 item, $68.00 |
| Bag (backend) | Add 10 of a tee with 2 left in S | Refused: "Only 2 left in S." |
| Test checkout | Review, store pickup | $68.00 + $0 shipping + $4.32 tax (6.35%) = **$72.32**, `payment_ready: false` — nothing charged, no order created |
| Wishlist (backend) | Save Basic Hoodie Big Yale | 200 |
| Wishlist + Dan | "What is on my wishlist and is it in stock in L?" | "Your wishlist has the Basic Hoodie Big Yale. It's in stock in L, with 8 available." (DB: 8 ✓) |
| Fuzzy search | `grey hooddies` | corrected to "gray hoodie" |
| Encryption | `chat_messages` rows starting `enc:v1:` | 34 / 34 |
| Frontend | Bag icon, dark-mode toggle, My Profile link, Add to bag, hearts on cards and product page, Profile Wishlist + Your bag, checkout "not connected" payment step, live search "you typed", scroll reveal, manifest, recovery codes on sign-up | all present in the code the dev server serves |
| Pages | `/`, `/bag`, `/checkout`, `/profile`, `/forgot-password` | all 200 |
| Build | `npx tsc -b` | passes |

Not verifiable without a browser session here: exact visual look of dark mode, the reveal animation feel, and the logo at small sizes — check those by eye.
