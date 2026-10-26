/**
 * "Cursed Heirloom" (the v7 art direction): an antique carved-wood board game under candlelight, oil-painted creatures, brass,
 * and an emerald curse-glow. The design tokens live in style.css (:root); this file holds the few the scripts need.
 */
export const ART = `${import.meta.env.BASE_URL}art/`;

/** Seat colours: amber, teal, rose, sky — never the curse's emerald or the blood red of a lost heart. */
export const SEAT = [
  { color: '#f2a93b', name: 'amber' },
  { color: '#2ec4b6', name: 'teal' },
  { color: '#ff5d8f', name: 'rose' },
  { color: '#6aa8ff', name: 'sky' },
] as const;

export const HERO_ART: Readonly<Record<string, string>> = {
  Explorer: 'hero-explorer',
  Hunter: 'hero-hunter',
  Pilot: 'hero-pilot',
  Scientist: 'hero-scientist',
};
export const heroArt = (hero: string): string => `${ART}${HERO_ART[hero] ?? 'hero-explorer'}.webp`;

/** The background of a creature's card, by tier (a clearing, ruins, the storm temple). */
export const cardBg = (tier: number): string => `${ART}bg-${Math.min(3, Math.max(1, tier))}.webp`;
