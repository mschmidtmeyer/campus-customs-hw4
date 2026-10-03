import type { Season } from './seasonContext'

/**
 * Offline fallback copy. Mirrors COPY in backend/season.py word for word, so the hero
 * reads the same whether or not GET /api/season has answered yet. Picks (products,
 * prices, stock) only ever come from the API.
 */
export interface SeasonCopy {
  label: string
  headline: string
  tagline: string
  campusTitle: string
  note: string
  /** Accessible description of the illustrated campus scene. */
  sceneLabel: string
}

export const SEASON_COPY: Record<Season, SeasonCopy> = {
  winter: {
    label: 'Winter',
    headline: 'Warm layers for a New Haven winter',
    tagline: 'Fleece, full-zips, and cozy hoodies to keep you warm from Cross Campus to Broadway.',
    campusTitle: 'Snow in the Hopper College courtyard',
    note: 'Shopping for the holidays? A Yale fleece or full-zip makes a warm gift.',
    sceneLabel:
      'Illustration of Yale at dusk in winter: Harkness Tower and Gothic halls with snow on the roofs, bare elms, glowing lamp posts and falling snow.',
  },
  spring: {
    label: 'Spring',
    headline: 'Lighter layers for longer days',
    tagline: 'Quarter-zips and crewnecks for breezy mornings and sunny afternoons on campus.',
    campusTitle: "Saybrook's Killingworth Court in bloom",
    note: 'Commencement is in May. A Yale crewneck makes a proud graduation gift.',
    sceneLabel:
      'Illustration of Yale on a spring morning: Harkness Tower and Gothic halls behind pink magnolias, with blossom petals drifting by.',
  },
  summer: {
    label: 'Summer',
    headline: 'Bright tees for long summer days',
    tagline: 'Easy tees and light long sleeves for summer on the Green and beyond.',
    campusTitle: 'Harkness Tower from Old Campus',
    note: 'Visiting New Haven this summer? Stop by our shop at 57 Broadway.',
    sceneLabel:
      'Illustration of Yale on a golden summer evening: Harkness Tower and Gothic halls behind deep green elms, with fireflies floating over the lawn.',
  },
  fall: {
    label: 'Fall',
    headline: 'Crisp air, Yale blue, game days ahead',
    tagline: 'Crewnecks, hoodies, and quarter-zips for crisp walks under the elms, and The Game.',
    campusTitle: 'Autumn walk by Cross Campus',
    note: 'The Game vs. Harvard is in November — gear up.',
    sceneLabel:
      'Illustration of Yale on a fall afternoon: Harkness Tower and Gothic halls framed by orange and red elms, with maple leaves falling.',
  },
}
