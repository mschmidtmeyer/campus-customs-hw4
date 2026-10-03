import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { useBag } from '../bag/bagContext'
import './Navbar.css'

type Theme = 'light' | 'dark'
const THEME_KEY = 'cc-theme'
const THEME_COLORS: Record<Theme, string> = { light: '#00356b', dark: '#0b1626' }

function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  // Brief colour cross-fade, removed afterwards so it never slows normal interactions.
  root.classList.add('theme-anim')
  if (theme === 'dark') root.setAttribute('data-theme', 'dark')
  else root.removeAttribute('data-theme')
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((m) => m.setAttribute('content', THEME_COLORS[theme]))
  window.setTimeout(() => root.classList.remove('theme-anim'), 300)
}

/** Handsome Dan, the Yale bulldog, drawn entirely in CSS (see Navbar.css). */
function DanLogo() {
  return (
    <span className="dan-logo" aria-hidden="true">
      <span className="dan-logo__ear dan-logo__ear--l" />
      <span className="dan-logo__ear dan-logo__ear--r" />
      <span className="dan-logo__head" />
      <span className="dan-logo__blaze" />
      <span className="dan-logo__eye dan-logo__eye--l" />
      <span className="dan-logo__eye dan-logo__eye--r" />
      <span className="dan-logo__jowl dan-logo__jowl--l" />
      <span className="dan-logo__jowl dan-logo__jowl--r" />
      <span className="dan-logo__jaw" />
      <span className="dan-logo__nose" />
      <span className="dan-logo__collar" />
      <span className="dan-logo__tag">Y</span>
    </span>
  )
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme)
  const dark = theme === 'dark'

  // Follow the OS setting until the visitor makes an explicit choice.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => {
      let saved: string | null = null
      try {
        saved = localStorage.getItem(THEME_KEY)
      } catch {
        /* storage blocked */
      }
      if (saved) return
      const next: Theme = e.matches ? 'dark' : 'light'
      applyTheme(next)
      setTheme(next)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const toggle = () => {
    const next: Theme = dark ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      /* storage blocked: theme still applies for this visit */
    }
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-pressed={dark}
      aria-label="Dark mode"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggle}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
        {dark ? (
          <path
            fill="currentColor"
            d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a.6.6 0 0 0-.8-.7A9.5 9.5 0 1 0 21.2 15.4a.6.6 0 0 0-.7-.8Z"
          />
        ) : (
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none" />
            <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
          </g>
        )}
      </svg>
    </button>
  )
}

function BagLink() {
  const { count } = useBag()
  const label = `Bag, ${count} ${count === 1 ? 'item' : 'items'}`
  return (
    <Link to="/bag" className="nav-bag" aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
        <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8L5 8Z" />
          <path d="M9 10V6.5a3 3 0 0 1 6 0V10" />
        </g>
      </svg>
      {count > 0 && (
        <span className="nav-bag__count" aria-hidden="true">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/products', label: 'Products', end: false },
  { to: '/about', label: 'About Us', end: false },
  { to: '/visit', label: 'Visit Us', end: false },
  { to: '/size-guide', label: 'Size Guide', end: false },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const { user, logout } = useAuth()
  const location = useLocation()

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'nav-link nav-link--active' : 'nav-link'

  return (
    <header className="navbar">
      <div className="navbar__inner">
        <Link to="/" className="navbar__brand" aria-label="Campus Customs home">
          <DanLogo />
          <span className="navbar__wordmark">
            Campus Customs
            <small>New Haven · Est. on Broadway</small>
          </span>
        </Link>

        <ThemeToggle />
        <BagLink />

        <button
          type="button"
          className="navbar__toggle"
          aria-expanded={open}
          aria-controls="primary-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((o) => !o)}
        >
          <span className={open ? 'burger burger--open' : 'burger'} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>

        <nav
          id="primary-nav"
          className={open ? 'navbar__nav navbar__nav--open' : 'navbar__nav'}
          aria-label="Primary"
        >
          <ul className="navbar__links">
            {LINKS.map((l) => (
              <li key={l.to}>
                <NavLink to={l.to} end={l.end} className={linkClass} onClick={() => setOpen(false)}>
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="navbar__auth">
            {user ? (
              <>
                <span className="navbar__hello">Hi, {user.first_name ?? user.name}</span>
                <NavLink to="/profile" className={linkClass} onClick={() => setOpen(false)}>
                  My Profile
                </NavLink>
                <button
                  type="button"
                  className="nav-cta nav-cta--button"
                  onClick={() => {
                    setOpen(false)
                    void logout()
                  }}
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className={linkClass} onClick={() => setOpen(false)}>
                  Login
                </NavLink>
                <NavLink
                  to="/create-account"
                  className={({ isActive }) => (isActive ? 'nav-cta nav-cta--active' : 'nav-cta')}
                  onClick={() => setOpen(false)}
                >
                  Create Account
                </NavLink>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  )
}
