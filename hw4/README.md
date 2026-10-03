# Campus Customs — Yale merch shop + Handsome Dan (HW 4)

A shop website for Campus Customs (57 Broadway, New Haven) with a Pydantic AI shopping assistant, **Handsome Dan**.

- **Frontend:** React 19 + Vite + TypeScript (`frontend/`).
- **Backend:** FastAPI (`backend/`).
- **Data:** SQLite (`data/campus_customs.db`, local only).

Shoppers can browse and filter products, create an account, chat with Dan about price, stock, sizes and seasonal picks, and see Dan's matches appear on the page as product cards. Every answer comes from the database.

## Repository layout

```
hw4/
├── AI_prompts.md            # log of every prompt typed into the vibe coder, by problem
├── requirements.txt         # Python dependencies (backend)
├── .env.example             # environment variables, placeholders only
├── .gitignore               # keeps .env, the database and product images out of git
├── README.md
├── frontend/                # Vite React TypeScript app
│   └── public/campus/       # seasonal Yale campus photos (Wikimedia Commons, credited in CREDITS.md)
├── backend/
│   ├── main.py              # FastAPI app (uvicorn main:app)
│   ├── agent.py             # the agent: model via Portkey, prompt, tools, loop limits, run_chat()
│   ├── models.py            # structured types the agent and API use
│   ├── tools.py             # the 10 read-only tools Handsome Dan can call
│   ├── prompts/prompt.md    # system prompt (voice, grounding, safety rules)
│   ├── auth.py, memory.py, safety.py, audit.py, search.py, season.py, cart.py, wishlist.py, activity.py
│   └── scripts/             # one-time data prep + utilities
└── output/
    ├── harness.md           # how the whole system works (agent loop, limits, models, tools, safety)
    ├── design.md
    ├── usability.md
    ├── app_check.html       # site test report (open by double-click)
    ├── app_check_images/    # screenshots linked from app_check.html
    └── audit_trail.json     # append-only, hash-chained log of the agent loop
```

The agent itself is four files under `backend/`: `prompts/prompt.md`, `agent.py`, `tools.py` and `models.py`.

## 1. Place the data pack (not in git)

Put the course data pack inside this folder:

```
hw4/
└── data/
    ├── campus_customs.db
    └── products/            # product images referenced by the catalogue
```

`data/` is git-ignored, so the database and product images never go to GitHub.

## 2. Backend (FastAPI + agent)

Requires Python 3.11+ (developed on 3.14).

```bash
cd hw4
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r requirements.txt
cp .env.example .env          # then put your real PORTKEY_API_KEY in .env
```

**One-time data prep**, run once after placing the data pack:

```bash
backend/.venv/bin/python backend/scripts/clean_db.py               # normalizes garment types and colors, fills 3 stub rows; backs up the original DB first
backend/.venv/bin/python backend/scripts/clean_product_images.py   # white-background web copies in data/products_web (originals untouched)
```

**Start the API** on http://127.0.0.1:8000:

```bash
cd backend
.venv/bin/uvicorn main:app --reload --port 8000
```

What happens on first start:
- The backend adds its own tables and columns to the local DB: sessions, recovery codes, wishlist, cart, views and token usage.
- It generates `CHAT_ENCRYPTION_KEY` and `AUDIT_SALT` into `backend/.env`. That file is git-ignored; keep it.
- It creates `output/audit_trail.json` if it is missing.

Without a `PORTKEY_API_KEY` the shop still works. Only the chat answers "not configured".

## 3. Frontend (Vite + React)

Requires Node 20+ (developed on 24).

```bash
cd hw4/frontend
npm install
npm run dev                   # http://localhost:5173
```

Vite proxies `/api` and `/media` to the backend on port 8000, so start the backend first. Open http://localhost:5173.

## 4. Try it

- Browse **Products**: filters, live search (try `hooddies` or `grey`), product pages with stock per size and an "On a model" view.
- Open the Handsome Dan chat (bottom right) and ask, for example:
  - "What hoodies do you have?"
  - "Is this in M?" (on a product page)
  - "What should I wear to the Harvard game?"
- **Create an account** or sign in. You get recovery codes, a wishlist, a bag with a test checkout that stops before payment, and **My Profile**.
- Toggle dark mode and preview the seasons on the home page.

## 5. Useful scripts

| Command | What it does |
|---|---|
| `backend/.venv/bin/python backend/scripts/verify_audit_trail.py` | Checks the audit trail's hash chain |
| `backend/.venv/bin/python backend/set_password.py <email>` | Sets a new password for an account (prompts securely) |
| `backend/.venv/bin/python backend/scripts/generate_lookbook.py` | Optional AI lookbook photos (needs an image-enabled key) |

## Docs

- `output/harness.md`: the full technical description: agent loop, limits, models, tools, every safety rule, API, how to run.
- `output/design.md` and `output/usability.md`: what changed in the design and usability, and why.
- `output/app_check.html`: the site test report with screenshots.
- `AI_prompts.md`: every prompt given to the vibe coder, by problem.
