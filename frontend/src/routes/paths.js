/** Public brand site */
export const PATH_HOME = '/';
export const PATH_LOGIN = '/login';

/** Authenticated internal app (dashboard & tools) */
export const PATH_TOOLS = '/tools';

export function toolsPath(segment = '') {
    if (!segment) return PATH_TOOLS;
    const clean = String(segment).replace(/^\//, '');
    return `${PATH_TOOLS}/${clean}`;
}

/** Legacy tool URLs → /tools/... (for bookmarks) */
export const LEGACY_TOOL_REDIRECTS = [
    'quick-links',
    'price-checker',
    'order-loss',
    'failed-delivery',
    'pre-sales',
    'erp-oos',
    'sku-plan',
    'conversion-cleaner',
    'order-match',
    'warehouse-order',
    'socmed-scraping',
    'affiliate-analyzer',
    'shopee-affiliate',
    'tiktok-ads',
    'request-access',
    'access-management',
    'product-performance',
    'livestream-display',
    'photo-downloader',
    'sku-review',
    'brand-material',
    'social-media-analytics',
];
