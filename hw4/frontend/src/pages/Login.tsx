import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api'
import { useAuth } from '../auth/authContext'
import './Auth.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Errors {
  email?: string
  password?: string
}

/** Small CSS-only Handsome Dan for the "join the pack" card. */
function DanPup() {
  return (
    <span className="dan" aria-hidden="true">
      <span className="dan__ear dan__ear--l" />
      <span className="dan__ear dan__ear--r" />
      <span className="dan__face">
        <span className="dan__eye dan__eye--l" />
        <span className="dan__eye dan__eye--r" />
        <span className="dan__jowl">
          <span className="dan__nose" />
        </span>
      </span>
      <span className="dan__collar">Y</span>
    </span>
  )
}

export default function Login() {
  const { user, login, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const form = ev.currentTarget
    const e: Errors = {}
    if (!email.trim()) e.email = 'Please enter your email address.'
    else if (!EMAIL_RE.test(email.trim())) e.email = 'That email address doesn’t look right.'
    if (!password) e.password = 'Please enter your password.'
    setErrors(e)
    setFormError('')
    if (Object.keys(e).length > 0) {
      // Focus by id: aria-invalid isn't rendered until the next paint.
      form.querySelector<HTMLInputElement>(e.email ? '#login-email' : '#login-password')?.focus()
      return
    }
    setSubmitting(true)
    try {
      await login(email.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      setPassword('')
      setFormError(
        err instanceof ApiError && err.status === 401
          ? 'Email or password is incorrect.'
          : 'We couldn’t reach the shop server. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (user) {
    return (
      <main className="auth">
        <div className="auth__card">
          <h1>You’re signed in</h1>
          <p className="auth__sub">
            Welcome back, {user.first_name ?? user.name}. You’re signed in as <strong>{user.email}</strong>.
          </p>
          <div className="auth__actions">
            <Link to="/products" className="auth__submit auth__submit--link">Shop the collection</Link>
            <button type="button" className="auth__secondary" onClick={() => void logout()}>
              Log out
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="auth">
      <div className="auth__stack">
        <div className="auth__card">
          <h1>Welcome back</h1>
          <p className="auth__sub">Log in to chat with our assistant as yourself and keep your conversation history.</p>

          {formError && (
            <div className="auth__alert" role="alert">
              {formError}
            </div>
          )}

          <form onSubmit={onSubmit} noValidate className="auth__form">
            <div className="field">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? 'login-email-err' : undefined}
              />
              {errors.email && <p id="login-email-err" className="field__error">{errors.email}</p>}
            </div>
            <div className="field">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? 'login-password-err' : undefined}
              />
              {errors.password && <p id="login-password-err" className="field__error">{errors.password}</p>}
            </div>
            <button type="submit" className="auth__submit" disabled={submitting}>
              {submitting ? 'Logging in…' : 'Log in'}
            </button>
          </form>
          <p className="auth__switch">
            <Link to="/forgot-password">Forgot your password?</Link>
          </p>
        </div>

        <section className="join-card" aria-labelledby="join-title">
          <DanPup />
          <div className="join-card__text">
            <h2 id="join-title">New to Campus Customs?</h2>
            <p>
              Every Bulldog was a pup once. Join Handsome Dan’s pack and our assistant will know you by name the
              next time you stop by.
            </p>
            <Link to="/create-account" className="join-card__btn">
              Join the pack
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
