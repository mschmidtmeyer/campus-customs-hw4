import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ApiError, regenerateRecoveryCodes } from '../api'
import { useAuth } from '../auth/authContext'
import { passwordRules } from '../auth/passwordRules'
import RecoveryCodes from '../components/RecoveryCodes'
import './Auth.css'

type FieldName = 'current' | 'next' | 'confirm'
type Errors = Partial<Record<FieldName, string>>

export default function ChangePassword() {
  const { user, loading, changePassword } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState('')
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [codesAcked, setCodesAcked] = useState(false)
  const [genPassword, setGenPassword] = useState('')
  const [genError, setGenError] = useState('')
  const [generating, setGenerating] = useState(false)

  if (loading) return <main className="auth" aria-busy="true" />
  if (!user) return <Navigate to="/login" replace state={{ from: '/account/password' }} />

  const rules = passwordRules(next, {
    firstName: user.first_name ?? '',
    lastName: user.last_name ?? '',
    email: user.email,
    phone: user.phone ?? '',
  })

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const form = ev.currentTarget
    const e: Errors = {}
    if (!current) e.current = 'Please enter your current password.'
    const broken = rules.filter((r) => !r.ok)
    if (!next) e.next = 'Please choose a new password.'
    else if (broken.length) e.next = `Your password needs: ${broken.map((r) => r.label.toLowerCase()).join('; ')}.`
    if (!confirm) e.confirm = 'Please confirm your new password.'
    else if (confirm !== next) e.confirm = 'Passwords don’t match.'
    setErrors(e)
    setFormError('')
    const firstBad = (['current', 'next', 'confirm'] as FieldName[]).find((k) => e[k])
    if (firstBad) {
      form.querySelector<HTMLInputElement>(`#cp-${firstBad}`)?.focus()
      return
    }
    setSubmitting(true)
    try {
      const updated = await changePassword(current, next)
      setCodes(updated.recovery_codes)
      setCodesAcked(false)
      setCurrent('')
      setNext('')
      setConfirm('')
      setDone(true)
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        setErrors({
          current: err.fieldErrors.current_password?.join(' '),
          next: err.fieldErrors.new_password?.join(' '),
        })
        setFormError(err.message)
      } else {
        setFormError('We couldn’t reach the shop server. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function onGenerate(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    setGenError('')
    if (!genPassword) {
      setGenError('Please enter your current password.')
      ev.currentTarget.querySelector<HTMLInputElement>('#rc-current')?.focus()
      return
    }
    setGenerating(true)
    try {
      setCodes(await regenerateRecoveryCodes(genPassword))
      setCodesAcked(false)
      setGenPassword('')
    } catch (err) {
      setGenError(
        err instanceof ApiError && err.fieldErrors.current_password
          ? err.fieldErrors.current_password.join(' ')
          : err instanceof ApiError && err.status === 401
            ? 'Please log in again.'
            : 'We couldn’t reach the shop server. Please try again.',
      )
    } finally {
      setGenerating(false)
    }
  }

  const showCodes = codes && !codesAcked

  const input = (name: FieldName, label: string, value: string, set: (v: string) => void, autoComplete: string, extraDescribedBy?: string) => {
    const id = `cp-${name}`
    const describedBy = [extraDescribedBy ?? '', errors[name] ? `${id}-err` : ''].filter(Boolean).join(' ')
    return (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          type="password"
          autoComplete={autoComplete}
          value={value}
          onChange={(ev) => set(ev.target.value)}
          aria-invalid={errors[name] ? true : undefined}
          aria-describedby={describedBy || undefined}
        />
        {errors[name] && <p id={`${id}-err`} className="field__error">{errors[name]}</p>}
      </div>
    )
  }

  return (
    <main className="auth">
      <div className="auth__card">
        <h1>Update your password</h1>
        {showCodes ? (
          <>
            {done && (
              <div className="auth__notice" role="status">
                Your password is updated and secure. Other devices were signed out.
              </div>
            )}
            <RecoveryCodes codes={codes} doneLabel="Done" onDone={() => setCodesAcked(true)} />
          </>
        ) : done ? (
          <>
            <div className="auth__notice" role="status">
              Your password is updated and secure. Other devices were signed out. Your new recovery codes are saved.
            </div>
            <Link to="/products" className="auth__submit auth__submit--link">Back to shopping</Link>
          </>
        ) : (
          <>
            <p className="auth__sub">
              {user.password_needs_update
                ? 'Your current password was set before our security rules and isn’t secure. Choose a new one below.'
                : 'Choose a new password for your account.'}
            </p>
            {formError && (
              <div className="auth__alert" role="alert">
                {formError}
              </div>
            )}
            <form onSubmit={onSubmit} noValidate className="auth__form">
              {input('current', 'Current password', current, setCurrent, 'current-password')}
              {input('next', 'New password', next, setNext, 'new-password', 'cp-rules')}
              <ul id="cp-rules" className="pw-rules" aria-label="Password requirements">
                {rules.map((r) => (
                  <li key={r.id} className={r.ok ? 'pw-rules__item pw-rules__item--ok' : 'pw-rules__item'}>
                    <span aria-hidden="true">{r.ok ? '✓' : '•'}</span> {r.label}
                    <span className="visually-hidden">{r.ok ? ' (met)' : ' (not met yet)'}</span>
                  </li>
                ))}
              </ul>
              {input('confirm', 'Confirm new password', confirm, setConfirm, 'new-password')}
              <button type="submit" className="auth__submit" disabled={submitting}>
                {submitting ? 'Updating…' : 'Update password'}
              </button>
            </form>

            <section className="auth__section" aria-labelledby="rc-gen-title">
              <h2 id="rc-gen-title">Recovery codes</h2>
              <p className="auth__sub">
                {codesAcked
                  ? 'Your new recovery codes are active. Any older codes no longer work.'
                  : 'Generate new recovery codes to reset your password if you forget it. This replaces any codes you had before.'}
              </p>
              <form onSubmit={onGenerate} noValidate className="auth__form">
                <div className="field">
                  <label htmlFor="rc-current">Current password</label>
                  <input
                    id="rc-current"
                    type="password"
                    autoComplete="current-password"
                    value={genPassword}
                    onChange={(ev) => setGenPassword(ev.target.value)}
                    aria-invalid={genError ? true : undefined}
                    aria-describedby={genError ? 'rc-current-err' : undefined}
                  />
                  {genError && <p id="rc-current-err" className="field__error">{genError}</p>}
                </div>
                <button type="submit" className="auth__secondary" disabled={generating}>
                  {generating ? 'Generating…' : 'Generate new recovery codes'}
                </button>
              </form>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
