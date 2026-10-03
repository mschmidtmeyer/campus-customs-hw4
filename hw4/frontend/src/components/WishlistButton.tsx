import { useState, type MouseEvent } from 'react'
import { useWishlist } from '../wishlist/wishlistContext'
import './WishlistButton.css'

interface WishlistButtonProps {
  productId: string
  size?: 'sm' | 'lg'
  className?: string
}

/** Heart toggle for one product. Safe inside clickable cards: it never triggers the card link. */
export default function WishlistButton({ productId, size = 'sm', className = '' }: WishlistButtonProps) {
  const { has, toggle } = useWishlist()
  const saved = has(productId)
  const [pop, setPop] = useState(0)
  const label = saved ? 'Remove from wishlist' : 'Save to wishlist'

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!saved) setPop((n) => n + 1)
    void toggle(productId)
  }

  return (
    <button
      type="button"
      className={`wish-btn wish-btn--${size}${saved ? ' is-saved' : ''} ${className}`.trim()}
      aria-pressed={saved}
      aria-label={size === 'sm' ? label : undefined}
      title={label}
      onClick={onClick}
    >
      <svg
        key={pop}
        className={`wish-btn__heart${pop ? ' wish-btn__heart--pop' : ''}`}
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M12 20.5s-7.5-4.6-9.6-9.2C.9 8 2.6 4.3 6.2 3.7c2.2-.4 4.3.7 5.8 2.6 1.5-1.9 3.6-3 5.8-2.6 3.6.6 5.3 4.3 3.8 7.6-2.1 4.6-9.6 9.2-9.6 9.2z" />
      </svg>
      {size === 'lg' && (
        <span className="wish-btn__text">
          {saved ? 'Saved' : 'Save'}
          <span className="visually-hidden-wish"> {saved ? '— remove from wishlist' : 'to wishlist'}</span>
        </span>
      )}
    </button>
  )
}
