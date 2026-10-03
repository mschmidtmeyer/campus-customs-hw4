import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, reviewCheckout } from '../api'
import { useAuth } from '../auth/authContext'
import { useBag } from '../bag/bagContext'
import { formatPrice } from '../components/productUtils'
import { STORE_ADDRESS } from '../storeInfo'
import type { CheckoutAddress, CheckoutContact, CheckoutReview, Fulfillment } from '../types'
import './Bag.css'
import './Checkout.css'

const STORE_ADDRESS_LINE = `${STORE_ADDRESS.street}, ${STORE_ADDRESS.cityLine}`
const STEPS = ['Details', 'Review', 'Payment'] as const
type Step = 0 | 1 | 2

function Progress({ step }: { step: Step }) {
  return (
    <ol className="co-progress" aria-label="Checkout progress">
      {STEPS.map((label, i) => (
        <li
          key={label}
          className={i < step ? 'is-done' : i === step ? 'is-current' : ''}
          aria-current={i === step ? 'step' : undefined}
        >
          <span className="co-progress__num" aria-hidden="true">
            {i < step ? '✓' : i + 1}
          </span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  ...rest
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  error?: string[]
  type?: string
  autoComplete?: string
  inputMode?: 'text' | 'numeric' | 'tel' | 'email'
  maxLength?: number
  required?: boolean
}) {
  return (
    <div className="co-field">
      <label htmlFor={id}>
        {label}
        {rest.required === false && <span className="bag-muted"> (optional)</span>}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        {...rest}
      />
      {error && (
        <p id={`${id}-err`} className="co-field__err">
          {error.join(' ')}
        </p>
      )}
    </div>
  )
}

export default function Checkout() {
  const { user } = useAuth()
  const { items, loading } = useBag()
  const [step, setStep] = useState<Step>(0)
  const [fulfillment, setFulfillment] = useState<Fulfillment>('pickup')
  const [contact, setContact] = useState<CheckoutContact>({ name: '', email: '', phone: '' })
  const [address, setAddress] = useState<CheckoutAddress>({ line1: '', line2: '', city: '', state: 'CT', zip: '' })
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [review, setReview] = useState<CheckoutReview | null>(null)
  const [busy, setBusy] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const prefilled = useRef(false)

  // Prefill contact details for signed-in shoppers (once).
  useEffect(() => {
    if (!user || prefilled.current) return
    prefilled.current = true
    setContact((c) => ({
      name: c.name || user.name || '',
      email: c.email || user.email || '',
      phone: c.phone || user.phone || '',
    }))
  }, [user])

  // Move focus to the step heading so screen readers announce each step.
  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  const submitDetails = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    setFormError(null)
    try {
      const result = await reviewCheckout({
        fulfillment,
        contact,
        address: fulfillment === 'ship' ? { ...address, line2: address.line2 || undefined } : undefined,
        items: user ? undefined : items.map((i) => ({ product_id: i.product_id, size: i.size, quantity: i.quantity })),
      })
      setReview(result)
      setStep(1)
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        setErrors(err.fieldErrors)
        setFormError('Please fix the highlighted fields.')
      } else {
        setFormError(err instanceof Error ? err.message : 'Could not review your order.')
      }
    } finally {
      setBusy(false)
    }
  }

  if (!loading && items.length === 0 && step === 0) {
    return (
      <main className="page co-page">
        <h1 className="bag-title">Checkout</h1>
        <div className="bag-empty">
          <p className="bag-empty__lead">Your bag is empty.</p>
          <Link to="/products" className="bag-btn">
            Shop products
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="page co-page">
      <div className="co-testmode" role="note">
        <strong>Test mode</strong> · Payment isn't connected. No order is placed and nothing is charged.
      </div>
      <h1 className="bag-title">Checkout</h1>
      <Progress step={step} />

      {step === 0 && (
        <form className="co-card" onSubmit={submitDetails} noValidate>
          <h2 ref={headingRef} tabIndex={-1} className="co-step-title">
            1. Your details
          </h2>
          <fieldset className="co-fieldset">
            <legend>Contact</legend>
            <Field id="co-name" label="Full name" value={contact.name} autoComplete="name" maxLength={100} required
              onChange={(v) => setContact({ ...contact, name: v })} error={errors.name} />
            <div className="co-row">
              <Field id="co-email" label="Email" type="email" inputMode="email" value={contact.email} autoComplete="email" maxLength={254} required
                onChange={(v) => setContact({ ...contact, email: v })} error={errors.email} />
              <Field id="co-phone" label="Phone" type="tel" inputMode="tel" value={contact.phone} autoComplete="tel" maxLength={30} required
                onChange={(v) => setContact({ ...contact, phone: v })} error={errors.phone} />
            </div>
          </fieldset>

          <fieldset className="co-fieldset">
            <legend>How do you want it?</legend>
            <div className="co-options">
              <label className={`co-option${fulfillment === 'pickup' ? ' is-selected' : ''}`}>
                <input type="radio" name="fulfillment" value="pickup" checked={fulfillment === 'pickup'}
                  onChange={() => setFulfillment('pickup')} />
                <span>
                  <strong>Pick up in store — Free</strong>
                  <small>{STORE_ADDRESS_LINE}</small>
                </span>
              </label>
              <label className={`co-option${fulfillment === 'ship' ? ' is-selected' : ''}`}>
                <input type="radio" name="fulfillment" value="ship" checked={fulfillment === 'ship'}
                  onChange={() => setFulfillment('ship')} />
                <span>
                  <strong>Ship to me — $8</strong>
                  <small>Free on orders over $100</small>
                </span>
              </label>
            </div>
          </fieldset>

          {fulfillment === 'ship' && (
            <fieldset className="co-fieldset">
              <legend>Shipping address</legend>
              <Field id="co-line1" label="Street address" value={address.line1} autoComplete="address-line1" maxLength={100} required
                onChange={(v) => setAddress({ ...address, line1: v })} error={errors.line1} />
              <Field id="co-line2" label="Apt, suite, etc." value={address.line2 ?? ''} autoComplete="address-line2" maxLength={100} required={false}
                onChange={(v) => setAddress({ ...address, line2: v })} error={errors.line2} />
              <div className="co-row co-row--3">
                <Field id="co-city" label="City" value={address.city} autoComplete="address-level2" maxLength={60} required
                  onChange={(v) => setAddress({ ...address, city: v })} error={errors.city} />
                <Field id="co-state" label="State" value={address.state} autoComplete="address-level1" maxLength={2} required
                  onChange={(v) => setAddress({ ...address, state: v.toUpperCase() })} error={errors.state} />
                <Field id="co-zip" label="ZIP" value={address.zip} autoComplete="postal-code" inputMode="numeric" maxLength={5} required
                  onChange={(v) => setAddress({ ...address, zip: v.replace(/\D/g, '') })} error={errors.zip} />
              </div>
            </fieldset>
          )}

          <p className="co-form-error" role="alert" aria-live="assertive">
            {formError}
          </p>
          <div className="co-actions">
            <Link to="/bag" className="bag-btn bag-btn--ghost">
              Back to bag
            </Link>
            <button type="submit" className="bag-btn" disabled={busy || loading}>
              {busy ? 'Checking stock…' : 'Review order'}
            </button>
          </div>
        </form>
      )}

      {step === 1 && review && (
        <section className="co-card" aria-labelledby="co-review-title">
          <h2 id="co-review-title" ref={headingRef} tabIndex={-1} className="co-step-title">
            2. Review your order
          </h2>
          {review.problems.length > 0 && (
            <div className="co-problems" role="alert">
              <strong>Some items can't be ordered right now:</strong>
              <ul>
                {review.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <p>These lines are left out of the total. Update your bag to fix them.</p>
            </div>
          )}
          <ul className="co-lines">
            {review.lines.map((l) => {
              const bad = !l.product || l.available < l.quantity
              return (
                <li key={`${l.product_id}-${l.size}`} className={bad ? 'is-bad' : ''}>
                  <div className="co-lines__img">{l.product && <img src={l.product.image_url} alt="" />}</div>
                  <div>
                    <p className="co-lines__name">{l.product?.name ?? l.product_id}</p>
                    <p className="bag-muted">
                      Size {l.size} · Qty {l.quantity}
                      {l.unit_price !== null && <> · {formatPrice(l.unit_price)} each</>}
                    </p>
                  </div>
                  <p className="co-lines__total">{bad ? 'Unavailable' : formatPrice(l.line_total)}</p>
                </li>
              )
            })}
          </ul>
          <dl className="co-totals">
            <div><dt>Subtotal</dt><dd>{formatPrice(review.subtotal)}</dd></div>
            <div>
              <dt>{review.fulfillment === 'pickup' ? 'Pickup at 57 Broadway' : 'Shipping'}</dt>
              <dd>{review.shipping === 0 ? 'Free' : formatPrice(review.shipping)}</dd>
            </div>
            <div><dt>CT sales tax (6.35%)</dt><dd>{formatPrice(review.tax)}</dd></div>
            <div className="co-totals__grand"><dt>Total</dt><dd>{formatPrice(review.total)}</dd></div>
          </dl>
          <p className="bag-muted co-ship-to">
            {review.fulfillment === 'pickup'
              ? `Pickup for ${contact.name} · ${STORE_ADDRESS_LINE}`
              : `Ship to ${contact.name}, ${address.line1}${address.line2 ? `, ${address.line2}` : ''}, ${address.city}, ${address.state} ${address.zip}`}
          </p>
          <div className="co-actions">
            <button type="button" className="bag-btn bag-btn--ghost" onClick={() => setStep(0)}>
              Edit details
            </button>
            {review.problems.length > 0 ? (
              <Link to="/bag" className="bag-btn">
                Fix my bag
              </Link>
            ) : (
              <button type="button" className="bag-btn" onClick={() => setStep(2)}>
                Continue to payment
              </button>
            )}
          </div>
        </section>
      )}

      {step === 2 && review && (
        <section className="co-card" aria-labelledby="co-pay-title">
          <h2 id="co-pay-title" ref={headingRef} tabIndex={-1} className="co-step-title">
            3. Payment <span className="co-badge">Test mode</span>
          </h2>
          <div className="co-banner" role="status">
            <strong>Payment isn't connected yet.</strong> This is where you'd pay — your order has not been placed and
            you won't be charged.
          </div>
          {/* Static mock only: these are NOT inputs and collect nothing. */}
          <div className="co-card-mock" aria-hidden="true">
            <div className="co-mock-field co-mock-field--wide">
              <span>Card number</span>
              <div>•••• •••• •••• ••••</div>
            </div>
            <div className="co-mock-field">
              <span>Expiry</span>
              <div>MM / YY</div>
            </div>
            <div className="co-mock-field">
              <span>CVC</span>
              <div>•••</div>
            </div>
            <div className="co-mock-pay">Pay {formatPrice(review.total)}</div>
          </div>
          <p className="bag-muted co-mock-caption">
            Card form preview (disabled). We never ask for or store card details on this site.
          </p>
          <div className="co-actions">
            <Link to="/bag" className="bag-btn bag-btn--ghost">
              Back to bag
            </Link>
            <Link to="/products" className="bag-btn">
              Keep shopping
            </Link>
          </div>
        </section>
      )}
    </main>
  )
}
