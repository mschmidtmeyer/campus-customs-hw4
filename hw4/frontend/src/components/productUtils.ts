// Shared display helpers for product cards, the detail page, and the chat panel.
import type { Product } from '../types'

/** Swatch colors for the 14 canonical catalogue colors. */
export const COLOR_SWATCH: Record<string, string> = {
  navy: '#00356b',
  white: '#ffffff',
  gray: '#9aa3ad',
  charcoal: '#3d434b',
  red: '#c8102e',
  black: '#111111',
  blue: '#286dc0',
  'light blue': '#9cc7f0',
  yellow: '#f5d547',
  cream: '#f3ead3',
  gold: '#c9a227',
  green: '#2e7d4f',
  coral: '#f08a75',
  multicolor: 'conic-gradient(#c8102e, #f5d547, #2e7d4f, #286dc0, #c8102e)',
}

export function swatchFor(color: string): string {
  return COLOR_SWATCH[color.toLowerCase()] ?? '#cbd5e1'
}

export function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`
}

export const LOW_STOCK_THRESHOLD = 15

export function stockBadge(product: Product): { label: string; tone: 'sold' | 'low' } | null {
  if (product.total_stock <= 0) return { label: 'Sold out', tone: 'sold' }
  if (product.total_stock <= LOW_STOCK_THRESHOLD) return { label: 'Low stock', tone: 'low' }
  return null
}
