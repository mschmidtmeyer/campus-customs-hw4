import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Product } from '../types'
import {
  SEASONS,
  SeasonContext,
  seasonForDate,
  type CampusPhoto,
  type Season,
  type SeasonInfo,
  type SeasonState,
} from './seasonContext'

/** 'now' = GET /api/season with no param (today's season in New Haven). */
type Key = Season | 'now'

interface Entry {
  info: SeasonInfo | null
  failed: boolean
}

const isStr = (v: unknown): v is string => typeof v === 'string'

function asSeason(value: unknown): Season | null {
  return isStr(value) && (SEASONS as string[]).includes(value) ? (value as Season) : null
}

/** Keep well-formed products only; fill optional fields so ProductCard can render them. */
function toProduct(raw: unknown): Product | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Partial<Product>
  if (!isStr(p.product_id) || !isStr(p.name) || typeof p.price !== 'number' || !isStr(p.image_url)) return null
  return {
    product_id: p.product_id,
    name: p.name,
    garment_type: isStr(p.garment_type) ? p.garment_type : '',
    description: isStr(p.description) ? p.description : '',
    colors: Array.isArray(p.colors) ? p.colors.filter(isStr) : [],
    search_tags: Array.isArray(p.search_tags) ? p.search_tags.filter(isStr) : [],
    image_file_path: isStr(p.image_file_path) ? p.image_file_path : '',
    image_url: p.image_url,
    price: p.price,
    inventory: Array.isArray(p.inventory) ? p.inventory : [],
    total_stock: typeof p.total_stock === 'number' ? p.total_stock : 0,
  }
}

function toSeasonInfo(raw: unknown): SeasonInfo | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  const season = asSeason(d.season)
  if (!season || !isStr(d.label) || !isStr(d.headline) || !isStr(d.tagline) || !isStr(d.campus_title)) return null
  const picks = Array.isArray(d.picks) ? d.picks.map(toProduct).filter((p): p is Product => p !== null) : []
  return {
    season,
    label: d.label,
    headline: d.headline,
    tagline: d.tagline,
    campus_title: d.campus_title,
    picks: picks.slice(0, 8),
    note: isStr(d.note) && d.note.trim() ? d.note : null,
  }
}

const SAFE_IMAGE = /^(\/(?!\/)|https:\/\/)/i
const SAFE_LINK = /^https?:\/\//i

/** public/campus/photos.json: { "fall": {url, title, credit, source_url, license_url}, ... } (may be {}). */
function toPhotos(raw: unknown): Partial<Record<Season, CampusPhoto>> {
  const out: Partial<Record<Season, CampusPhoto>> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const s of SEASONS) {
    const p = (raw as Record<string, unknown>)[s]
    if (!p || typeof p !== 'object') continue
    const { url, title, credit, source_url, license_url } = p as Record<string, unknown>
    if (!isStr(url) || !SAFE_IMAGE.test(url.trim()) || !isStr(title)) continue
    out[s] = {
      url: url.trim(),
      title,
      credit: isStr(credit) ? credit : '',
      source_url: isStr(source_url) && SAFE_LINK.test(source_url.trim()) ? source_url.trim() : '',
      license_url: isStr(license_url) && SAFE_LINK.test(license_url.trim()) ? license_url.trim() : null,
    }
  }
  return out
}

async function fetchSeasonInfo(key: Key, signal: AbortSignal): Promise<SeasonInfo> {
  // No param = today's season. An empty ?season= is rejected (422), so omit it entirely.
  const url = key === 'now' ? '/api/season' : `/api/season?season=${encodeURIComponent(key)}`
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${res.status} for ${url}`)
  const info = toSeasonInfo(await res.json())
  if (!info) throw new Error(`Unexpected response from ${url}`)
  return info
}

/**
 * Season for the whole site: fetches /api/season (live picks + hero copy), lets visitors
 * preview another season (?season=winter or setPreview), reads optional real campus
 * photos, and mirrors the shown season to <html data-season> for the accent tokens.
 * Everything still renders if the API is down (copy falls back to seasonCopy.ts).
 */
export default function SeasonProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams()
  const urlSeason = asSeason(params.get('season'))

  // The preview starts from ?season=…, follows later navigations that carry one, and is
  // otherwise kept for the visit (it does not reset when a page drops the param).
  const [preview, setPreviewState] = useState<Season | null>(urlSeason)
  const [seenUrlSeason, setSeenUrlSeason] = useState<Season | null>(urlSeason)
  if (urlSeason !== seenUrlSeason) {
    setSeenUrlSeason(urlSeason)
    if (urlSeason) setPreviewState(urlSeason)
  }

  const [entries, setEntries] = useState<Partial<Record<Key, Entry>>>({})
  const [photos, setPhotos] = useState<Partial<Record<Season, CampusPhoto>>>({})

  // Today's season: the browser's date until the API (New Haven time) answers.
  const actualSeason: Season = entries.now?.info?.season ?? seasonForDate()
  const activePreview = preview && preview !== actualSeason ? preview : null
  const key: Key = activePreview ?? 'now'
  const season: Season = activePreview ?? actualSeason
  const entry = entries[key]
  const info = entry?.info && entry.info.season === season ? entry.info : null
  const loading = entry === undefined

  // Fetch (or refresh) the season on screen whenever it changes; cached data shows meanwhile.
  useEffect(() => {
    const controller = new AbortController()
    fetchSeasonInfo(key, controller.signal).then(
      (next) => setEntries((prev) => ({ ...prev, [key]: { info: next, failed: false } })),
      () => {
        if (controller.signal.aborted) return
        // API down / not deployed yet: keep earlier data if any, otherwise use the fallback copy.
        setEntries((prev) => ({ ...prev, [key]: { info: prev[key]?.info ?? null, failed: true } }))
      },
    )
    return () => controller.abort()
  }, [key])

  // Opened straight into a preview? Still ask the API once which season it really is.
  const previewing = key !== 'now'
  const knowsToday = entries.now !== undefined
  useEffect(() => {
    if (!previewing || knowsToday) return
    const controller = new AbortController()
    fetchSeasonInfo('now', controller.signal).then(
      (next) => setEntries((prev) => ({ ...prev, now: { info: next, failed: false } })),
      () => {
        if (controller.signal.aborted) return
        setEntries((prev) => (prev.now ? prev : { ...prev, now: { info: null, failed: true } }))
      },
    )
    return () => controller.abort()
  }, [previewing, knowsToday])

  // Optional real campus photos (public/campus/photos.json); the illustration is the default.
  useEffect(() => {
    const controller = new AbortController()
    fetch('/campus/photos.json', { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => setPhotos(toPhotos(data)))
      .catch(() => {
        /* no photos file: keep the illustrated scenes */
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-season', season)
  }, [season])

  // Stable setter (setSearchParams changes identity on every URL change).
  const setParamsRef = useRef(setParams)
  useEffect(() => {
    setParamsRef.current = setParams
  })

  const setPreview = useCallback(
    (next: Season | null) => {
      const value = next && next !== actualSeason ? next : null
      setPreviewState(value)
      setSeenUrlSeason(value)
      // Mirror the preview in the current URL so it survives a reload and can be shared.
      if (new URLSearchParams(window.location.search).get('season') === value) return
      setParamsRef.current(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (value) p.set('season', value)
          else p.delete('season')
          return p
        },
        { replace: true, preventScrollReset: true },
      )
    },
    [actualSeason],
  )

  const photo = photos[season] ?? null
  const value = useMemo<SeasonState>(
    () => ({ season, actualSeason, isPreview: activePreview !== null, info, photo, loading, setPreview }),
    [season, actualSeason, activePreview, info, photo, loading, setPreview],
  )

  return <SeasonContext.Provider value={value}>{children}</SeasonContext.Provider>
}
