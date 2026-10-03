import type { ReactNode } from 'react'
import type { Season } from '../season/seasonContext'

/** Maple leaf outline in a 24×24 box (also used for the falling leaves in CampusScene). */
export const MAPLE_LEAF_PATH =
  'M12 1.5l1.6 3.7 2.2-1-.5 4.4 3.4-1.7-.6 2.7 3.4.6-2.3 2.4 1 1.7h-4l.6 3.3-4-2v6.9h-1.6v-6.9l-4 2 .6-3.3h-4l1-1.7-2.3-2.4 3.4-.6-.6-2.7 3.4 1.7-.5-4.4 2.2 1z'

const ICONS: Record<Season, ReactNode> = {
  winter: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5" />
      <path d="M9.4 4.3 12 6.6l2.6-2.3M9.4 19.7l2.6-2.3 2.6 2.3M4.6 10.6l3.3-.8-1-3.3M19.4 13.4l-3.3.8 1 3.3M4.6 13.4l3.3.8-1 3.3M19.4 10.6l-3.3-.8 1-3.3" />
    </g>
  ),
  spring: (
    <g fill="currentColor">
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx="12" cy="6.2" rx="3.1" ry="3.9" transform={`rotate(${a} 12 12)`} />
      ))}
      <circle cx="12" cy="12" r="1.7" />
    </g>
  ),
  summer: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
    </g>
  ),
  fall: <path fill="currentColor" d={MAPLE_LEAF_PATH} />,
}

/** Tiny decorative icon for a season (snowflake, blossom, sun, maple leaf). */
export default function SeasonIcon({ season, className = '' }: { season: Season; className?: string }) {
  return (
    <svg
      className={`season-icon ${className}`.trim()}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[season]}
    </svg>
  )
}
