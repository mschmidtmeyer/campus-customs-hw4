import { createContext, useContext } from 'react'
import type { Product } from '../types'

export type Season = 'winter' | 'spring' | 'summer' | 'fall'
export const SEASONS: Season[] = ['winter', 'spring', 'summer', 'fall']

/** A real campus photo for a season (optional; the illustrated scene is the fallback). */
export interface CampusPhoto {
  url: string // e.g. /campus/fall.jpg
  title: string // e.g. "Old Campus in October"
  credit: string // author + license, shown on the page
  source_url: string // where the photo came from
  license_url?: string | null // link to the license (CC BY-SA), null for public domain
}

/** GET /api/season?season=<optional override> — see backend/season.py. */
export interface SeasonInfo {
  season: Season
  label: string // "Fall"
  headline: string // hero headline for the season
  tagline: string // one short line
  campus_title: string // e.g. "Old Campus under the elms"
  picks: Product[] // live, in-stock seasonal recommendations (≤8)
  note: string | null // e.g. "The Game is in November"
}

export interface SeasonState {
  season: Season // season currently shown (real or preview)
  actualSeason: Season // season by today's date in New Haven
  isPreview: boolean
  info: SeasonInfo | null
  photo: CampusPhoto | null
  loading: boolean
  setPreview: (season: Season | null) => void // null = back to today's season
}

export const SeasonContext = createContext<SeasonState | null>(null)

export function useSeason(): SeasonState {
  const ctx = useContext(SeasonContext)
  if (!ctx) throw new Error('useSeason must be used inside <SeasonProvider>')
  return ctx
}

/** Northern-hemisphere meteorological seasons (New Haven). */
export function seasonForDate(d: Date = new Date()): Season {
  const m = d.getMonth() // 0 = Jan
  if (m === 11 || m <= 1) return 'winter'
  if (m <= 4) return 'spring'
  if (m <= 7) return 'summer'
  return 'fall'
}
