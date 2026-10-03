import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api'
import { useAuth } from '../auth/authContext'
import { passwordRules } from '../auth/passwordRules'
import RecoveryCodes from '../components/RecoveryCodes'
import './Auth.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CODE_RE = /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/

type FieldName = 'email' | 'code' | 'next' | 'confirm'
type Errors = Partial<Record<FieldName, string>>

export default function ForgotPassword() {
  const { resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [newCodes, setNewCodes] = useState<string[] | null>(null)
  const [finished, setFinished] = useState(false)

  // Name and phone aren't known here; the server checks those rules too.
  const rules = passwordRules(next, { firstName: '', lastName: '', email, phone: '' })

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const form = ev.currentTarget
    const e: Errors = {}
    if (!email.trim()) e.email = 'Please enter your email address.'
    else if (!EMAIL_RE.test(email.trim())) e.email = 'That email address doesn’t look right.'
    if (!code.trim()) e.code = 'Please enter one of your recovery codes.'
    else if (!CODE_RE.test(code.trim().replace(/\s/g, ''))) e.code = 'Recovery codes look like ABCD-EFGH.'
    const broken = rules.filter((r) => !r.ok)
    if (!next) e.next = 'Please choose a new password.'
    else if (broken.length) e.next = `Your password needs: ${broken.map((r) => r.label.toLowerCase()).join('; ')}.`
    if (!confirm) e.confirm = 'Please confirm your new password.'
    else if (confirm !== next) e.confirm = 'Passwords don’t match.'
    setErrors(e)
    setFormError('')
    const firstBad = (['email', 'code', 'next', 'confirm'] as FieldName[]).find((k) => e[k])
    if (firstBad) {
      form.querySelector<HTMLInputElement>(`#fp-${firstBad}`)?.focus()
      return
    }
    setSubmitting(true)
    try {
      const u = await resetPassword(email.trim(), code.trim(), next)
      setNewCodes(u.recovery_codes ?? [])
      setCode('')
      setNext('')
      setConfirm('')
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.new_password) {
        setErrors({ next: err.fieldErrors.new_password.join(' ') })
        setFormError(err.message)
      } else if (err instanceof ApiError && (err.status === 400 || err.status === 429)) {
        setFormError(err.message)
      } else {
        setFormError('We couldn’t reach the shop server. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const input = (
    name: FieldName,
    label: string,
    type: string,
    value: string,
    set: (v: string) => void,
    autoComplete: string,
    extra?: { hint?: string; describedBy?: string },
  ) => {
    const id = `fp-${name}`
    const describedBy = [extra?.hint ? `${id}-hint` : '', extra?.describedBy ?? '', errors[name] ? `${id}-err` : '']
      .filter(Boolean)
      .join(' ')
    return (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          type={type}
          autoComplete={autoComplete}
          value={value}
          onChange={(ev) => set(ev.target.value)}
          aria-invalid={errors[name] ? true : undefined}
          aria-describedby={describedBy || undefined}
          spellCheck={name === 'code' ? false : undefined}
          autoCapitalize={name === 'code' ? 'characters' : undefined}
        />
        {extra?.hint && <p id={`${id}-hint`} className="field__hint">{extra.hint}</p>}
        {errors[name] && <p id={`${id}-err`} className="field__error">{errors[name]}</p>}
      </div>
    )
  }

  if (newCodes && !finished) {
    return (
      <main className="auth">
        <div className="auth__card">
          <h1>Password reset</h1>
          <div className="auth__notice" role="status">
            Your new password is set and you’re signed in. Other devices were signed out, and the code you used
            (and all your old codes) no longer work.
          </div>
          <RecoveryCodes codes={newCodes} doneLabel="Continue" onDone={() => setFinished(true)} />
        </div>
      </main>
    )
  }

  if (finished) {
    return (
      <main className="auth">
        <div className="auth__card">
          <h1>You’re all set</h1>
          <p className="auth__sub">You’re signed in with your new password.</p>
          <Link to="/products" className="auth__submit auth__submit--link">Shop the collection</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="auth">
      <div className="auth__card">
        <h1>Reset your password</h1>
        <p className="auth__sub">
          Enter your email, one of the recovery codes you saved when you set your password, and a new password.
        </p>
        {formError && (
          <div className="auth__alert" role="alert">
            {formError}
          </div>
        )}
        <form onSubmit={onSubmit} noValidate className="auth__form">
          {input('email', 'Email', 'email', email, setEmail, 'email')}
          {input('code', 'Recovery code', 'text', code, setCode, 'one-time-code', { hint: 'Example: ABCD-EFGH. Each code works once.' })}
          {input('next', 'New password', 'password', next, setNext, 'new-password', { describedBy: 'fp-rules' })}
          <ul id="fp-rules" className="pw-rules" aria-label="Password requirements">
            {rules.map((r) => (
              <li key={r.id} className={r.ok ? 'pw-rules__item pw-rules__item--ok' : 'pw-rules__item'}>
                <span aria-hidden="true">{r.ok ? '✓' : '•'}</span> {r.label}
                <span className="visually-hidden">{r.ok ? ' (met)' : ' (not met yet)'}</span>
              </li>
            ))}
          </ul>
          {input('confirm', 'Confirm new password', 'password', confirm, setConfirm, 'new-password')}
          <button type="submit" className="auth__submit" disabled={submitting}>
            {submitting ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
        <p className="auth__switch">
          Remembered it? <Link to="/login">Log in</Link>
          <br />
          No recovery codes? Visit the store with your ID and we’ll help.
        </p>
      </div>
    </main>
  )
}
