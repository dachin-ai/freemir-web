import landingFeaturedSkus from './landingFeaturedSkus.json';

export const LANDING_FEATURED_SKUS = landingFeaturedSkus;

export const LANDING_STATS = [
  { id: 'years', value: '13+' },
  { id: 'markets', value: '10+' },
  { id: 'skus', value: String(landingFeaturedSkus.length) },
  { id: 'rating', value: '5★' },
];

export const LANDING_CATEGORIES = [
  { id: 'kuali' },
  { id: 'periuk' },
  { id: 'pressure' },
  { id: 'rice' },
  { id: 'blender' },
  { id: 'airfryer' },
  { id: 'utensils' },
  { id: 'knife' },
];

/** Hero background — freemir kitchen product shot (context/Kitchen_BG). */
export const HERO_IMAGE_CANDIDATES = ['/Kitchen_BG.png'];

/** About section — lifestyle kitchen with person (context/Sub_Kitchen_BG). */
export const ABOUT_IMAGE_CANDIDATES = ['/Sub_Kitchen_BG.png'];
