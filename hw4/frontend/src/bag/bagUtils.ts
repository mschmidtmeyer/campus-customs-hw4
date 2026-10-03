import type { BagItem } from './bagContext'

/** What's wrong with a bag line right now (live stock), or null. */
export function lineProblem(item: BagItem): string | null {
  if (!item.product) return 'No longer available'
  if (item.available <= 0) return `No longer available in ${item.size}`
  if (item.quantity > item.available) return `Only ${item.available} left in ${item.size} — lower the quantity`
  return null
}
