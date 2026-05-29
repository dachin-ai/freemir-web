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

/** Hero: elegant open kitchens (dapur) — woody tones, natural light, blue accents. */
export const HERO_IMAGE_CANDIDATES = [
  'https://images.unsplash.com/photo-1556912172-45b7abe8b7e1?w=1600&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1565538810643-b5bdb714032a?w=1600&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1556905040-f86a3728cda3?w=1600&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1600607687920-783a92d987a6?w=1600&q=80&auto=format&fit=crop',
];

export const ABOUT_IMAGE_CANDIDATES = [
  'https://images.unsplash.com/photo-1615873965287-d3a06275bcfe?w=900&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1560185127-5dcc4bf5b854?w=900&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&q=80&auto=format&fit=crop',
];
