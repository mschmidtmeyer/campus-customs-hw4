import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../api'
import { useAuth } from '../auth/authContext'
import { passwordRules } from '../auth/passwordRules'
import RecoveryCodes from '../components/RecoveryCodes'
import './Auth.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type FieldName = 'firstName' | 'lastName' | 'email' | 'phone' | 'password' | 'confirm'
type Values = Record<FieldName, string>
type Errors = Partial<Record<FieldName, string>>

const EMPTY: Values = { firstName: '', lastName: '', email: '', phone: '', password: '', confirm: '' }

// Server field names (backend/auth.py) -> form field names.
const SERVER_FIELDS: Record<string, FieldName> = {
  first_name: 'firstName',
  last_name: 'lastName',
  email: 'email',
  phone: 'phone',
  password: 'password',
}

export default function CreateAccount() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState<Values>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [codes, setCodes] = useState<string[] | null>(null)

  const rules = passwordRules(values.password, values)
  const set = (name: FieldName) => (ev: ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [name]: ev.target.value }))

  function validate(v: Values): Errors {
    const e: Errors = {}
    if (!v.firstName.trim()) e.firstName = 'Please enter your first name.'
    if (!v.lastName.trim()) e.lastName = 'Please enter your last name.'
    if (!v.email.trim()) e.email = 'Please enter your email address.'
    else if (!EMAIL_RE.test(v.email.trim())) e.email = 'That email address doesn’t look right.'
    const digits = v.phone.replace(/\D/g, '')
    if (!digits) e.phone = 'Please enter your phone number.'
    else if (digits.length < 10 || digits.length > 15) e.phone = 'Enter a phone number with 10 to 15 digits.'
    const broken = rules.filter((r) => !r.ok)
    if (!v.password) e.password = 'Please choose a password.'
    else if (broken.length) e.password = `Your password needs: ${broken.map((r) => r.label.toLowerCase()).join('; ')}.`
    if (!v.confirm) e.confirm = 'Please confirm your password.'
    else if (v.confirm !== v.password) e.confirm = 'Passwords don’t match.'
    return e
  }

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const form = ev.currentTarget
    const e = validate(values)
    setErrors(e)
    setFormError('')
    const firstBad = (Object.keys(EMPTY) as FieldName[]).find((k) => e[k])
    if (firstBad) {
      // Focus by id: aria-invalid isn't rendered until the next paint.
      form.querySelector<HTMLInputElement>(`#ca-${firstBad}`)?.focus()
      return
    }
    setSubmitting(true)
    try {
      const created = await register({
        first_name: values.firstName.trim(),
        last_name: values.lastName.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        password: values.password,
      })
      if (created.recovery_codes?.length) setCodes(created.recovery_codes)
      else navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        const next: Errors = {}
        for (const [key, msgs] of Object.entries(err.fieldErrors)) {
          const field = SERVER_FIELDS[key]
          if (field) next[field] = msgs.join(' ')
        }
        setErrors(next)
        setFormError(err.message)
      } else {
        setFormError('We couldn’t reach the shop server. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const field = (
    name: FieldName,
    label: string,
    type: string,
    autoComplete: string,
    extra?: { hint?: string; describedBy?: string },
  ) => {
    const id = `ca-${name}`
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
          value={values[name]}
          onChange={set(name)}
          aria-invalid={errors[name] ? true : undefined}
          aria-describedby={describedBy || undefined}
        />
        {extra?.hint && <p id={`${id}-hint`} className="field__hint">{extra.hint}</p>}
        {errors[name] && <p id={`${id}-err`} className="field__error">{errors[name]}</p>}
      </div>
    )
  }

  if (codes) {
    return (
      <main className="auth">
        <div className="auth__card">
          <h1>Welcome to the pack!</h1>
          <p className="auth__sub">Your account is ready. One last step: save your recovery codes.</p>
          <RecoveryCodes codes={codes} doneLabel="Start shopping" onDone={() => navigate('/', { replace: true })} />
        </div>
      </main>
    )
  }

  if (user) {
    return (
      <main className="auth">
        <div className="auth__card">
          <h1>You’re already in the pack</h1>
          <p className="auth__sub">
            Signed in as <strong>{user.email}</strong>. <Link to="/products">Browse the collection</Link>.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="auth">
      <div className="auth__card">
        <p className="auth__eyebrow">Handsome Dan’s newest pup</p>
        <h1>Join the pack</h1>
        <p className="auth__sub">Create your Campus Customs account. It takes about a minute.</p>

        {formError && (
          <div className="auth__alert" role="alert">
            {formError}
          </div>
        )}

        <form onSubmit={onSubmit} noValidate className="auth__form">
          <div className="auth__row">
            {field('firstName', 'First name', 'text', 'given-name')}
            {field('lastName', 'Last name', 'text', 'family-name')}
          </div>
          {field('email', 'Email', 'email', 'email')}
          {field('phone', 'Phone number', 'tel', 'tel', { hint: 'Example: (203) 555-0123' })}
          {field('password', 'Password', 'password', 'new-password', { describedBy: 'pw-rules' })}
          <ul id="pw-rules" className="pw-rules" aria-label="Password requirements">
            {rules.map((r) => (
              <li key={r.id} className={r.ok ? 'pw-rules__item pw-rules__item--ok' : 'pw-rules__item'}>
                <span aria-hidden="true">{r.ok ? '✓' : '•'}</span> {r.label}
                <span className="visually-hidden">{r.ok ? ' (met)' : ' (not met yet)'}</span>
              </li>
            ))}
          </ul>
          {field('confirm', 'Confirm password', 'password', 'new-password')}
          <button type="submit" className="auth__submit" disabled={submitting}>
            {submitting ? 'Creating your account…' : 'Create account'}
          </button>
        </form>

        <p className="auth__switch">
          Already part of the pack? <Link to="/login">Log in</Link>
        </p>
      </div>
    </main>
  )
}
