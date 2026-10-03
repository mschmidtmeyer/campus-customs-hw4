import { useContext, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { SeasonContext } from '../season/seasonContext'
import type { Product } from '../types'
import { formatPrice, stockBadge, swatchFor } from './productUtils'
import SeasonIcon from './SeasonIcon'
import WishlistButton from './WishlistButton'
import './ProductCard.css'

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:-]+$/, '')}…`
}

/** Garment types among the live seasonal picks (GET /api/season). Safe outside the provider. */
function useSeasonalTypes() {
  const ctx = useContext(SeasonContext)
  const info = ctx?.info ?? null
  const types = useMemo(() => new Set((info?.picks ?? []).map((p) => p.garment_type.toLowerCase())), [info])
  return { types, season: info ? ctx?.season ?? null : null, label: info?.label ?? '', isPreview: ctx?.isPreview ?? false }
}

interface ProductCardProps {
  product: Product
  compact?: boolean
}

export default function ProductCard({ product, compact = false }: ProductCardProps) {
  const badge = stockBadge(product)
  const seasonal = useSeasonalTypes()
  const inSeason =
    !compact && product.total_stock > 0 && seasonal.season !== null && seasonal.types.has(product.garment_type.toLowerCase())

  return (
    // The heart is a sibling of the link (a <button> inside an <a> is invalid HTML).
    <div className={`product-card-wrap${compact ? ' product-card-wrap--compact' : ''}`}>
      <Link
        to={`/products/${encodeURIComponent(product.product_id)}`}
        className={`product-card${compact ? ' product-card--compact' : ''}`}
      >
        <div className="product-card__media">
          <img src={product.image_url} alt={product.name} loading="lazy" />
          {(inSeason || badge) && (
            <div className="product-card__badges">
              {inSeason && seasonal.season && (
                <span className="product-card__badge product-card__badge--season">
                  <SeasonIcon season={seasonal.season} />
                  {seasonal.isPreview ? `${seasonal.label} pick` : 'In season'}
                </span>
              )}
              {badge && <span className={`product-card__badge product-card__badge--${badge.tone}`}>{badge.label}</span>}
            </div>
          )}
        </div>
        <div className="product-card__body">
          <span className="product-card__type">{product.garment_type}</span>
          <h3 className="product-card__name">{product.name}</h3>
          {!compact && product.description ? <p className="product-card__desc">{truncate(product.description, 90)}</p> : null}
          <div className="product-card__footer">
            <span className="product-card__price">{formatPrice(product.price)}</span>
            <ul className="product-card__colors" aria-label={`Colors: ${product.colors.join(', ')}`}>
              {product.colors.slice(0, 5).map((color) => (
                <li key={color} title={color}>
                  <span className="swatch" style={{ background: swatchFor(color) }} aria-hidden="true" />
                </li>
              ))}
              {product.colors.length > 5 && (
                <li className="product-card__more" aria-hidden="true">
                  +{product.colors.length - 5}
                </li>
              )}
            </ul>
          </div>
        </div>
      </Link>
      <WishlistButton productId={product.product_id} size="sm" className="product-card__wish" />
    </div>
  )
}
