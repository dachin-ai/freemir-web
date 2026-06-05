/**
 * Build paginated A4-landscape brochure pages from landing + compare API payloads.
 * Supports 4 layout types cycling for visual variety.
 */

export const BROCHURE_PAGE_TYPES = {
    COVER: 'cover',
    TOP_TIER: 'top-tier',
    PRODUCTS: 'products',
};

export const LAYOUT_TYPES = {
    FIVE_COL: 'five-col',
    HERO_LEFT: 'hero-left',
    FOUR_COL: 'four-col',
    THREE_COL: 'three-col',
};

/** Products per layout (how many fit on one sheet) */
const LAYOUT_CAPACITIES = {
    [LAYOUT_TYPES.FIVE_COL]: 10,
    [LAYOUT_TYPES.HERO_LEFT]: 7,
    [LAYOUT_TYPES.FOUR_COL]: 8,
    [LAYOUT_TYPES.THREE_COL]: 6,
};

/** Cycling order for catalog pages — creates visual rhythm */
const LAYOUT_CYCLE = [
    LAYOUT_TYPES.FIVE_COL,
    LAYOUT_TYPES.HERO_LEFT,
    LAYOUT_TYPES.FOUR_COL,
    LAYOUT_TYPES.FIVE_COL,
    LAYOUT_TYPES.THREE_COL,
    LAYOUT_TYPES.HERO_LEFT,
    LAYOUT_TYPES.FOUR_COL,
    LAYOUT_TYPES.THREE_COL,
];

/** Accent colors per cycle index */
const ACCENT_CYCLE = ['blue', 'blue', 'pink', 'blue', 'blue', 'pink', 'blue', 'blue'];

export const PRODUCTS_PER_PAGE = 10;

export function prettyAdvantage(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    const lower = raw.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function enrichProductFromMap(product, detailBySku) {
    const sku = String(product?.sku || '').trim().toUpperCase();
    const full = detailBySku.get(sku);
    if (!full) return product;
    return {
        ...product,
        ...full,
        detail: {
            ...(product.detail || {}),
            ...(full.detail || {}),
        },
    };
}

export function buildDetailBySku(compareProducts) {
    const map = new Map();
    (compareProducts || []).forEach((p) => {
        const sku = String(p?.sku || '').trim().toUpperCase();
        if (sku) map.set(sku, p);
    });
    return map;
}

function groupProductsByCategory(products, categoryOrder) {
    const groups = new Map();
    const order = [...(categoryOrder || [])];

    products.forEach((p) => {
        const cat = p.category_l2 || p.category_l1 || 'Other';
        if (!groups.has(cat)) {
            groups.set(cat, []);
            if (!order.includes(cat)) order.push(cat);
        }
        groups.get(cat).push(p);
    });

    return order
        .filter((cat) => (groups.get(cat) || []).length > 0)
        .map((cat) => ({ category: cat, products: groups.get(cat) }));
}

/**
 * Pack category sections into pages using cycling layouts.
 * Each page gets a layout and accent colour for visual variety.
 */
export function packProductBlocks(sections, { maxPages = 17, startCycleIdx = 0 } = {}) {
    const pages = [];
    let cycleIdx = startCycleIdx;
    let blocks = [];
    let countOnPage = 0;
    let layout = LAYOUT_CYCLE[cycleIdx % LAYOUT_CYCLE.length];
    let capacity = LAYOUT_CAPACITIES[layout];

    const flush = () => {
        if (blocks.length === 0) return;
        pages.push({
            blocks: [...blocks],
            layout,
            accent: ACCENT_CYCLE[cycleIdx % ACCENT_CYCLE.length],
        });
        blocks = [];
        countOnPage = 0;
        cycleIdx += 1;
        layout = LAYOUT_CYCLE[cycleIdx % LAYOUT_CYCLE.length];
        capacity = LAYOUT_CAPACITIES[layout];
    };

    for (const { category, products } of sections) {
        let offset = 0;
        while (offset < products.length) {
            const space = capacity - countOnPage;
            if (space <= 0) { flush(); continue; }
            const slice = products.slice(offset, offset + space);
            blocks.push({ category, products: slice, continued: offset > 0 });
            countOnPage += slice.length;
            offset += slice.length;
        }
    }
    flush();

    return pages.slice(0, maxPages);
}

/**
 * Build all brochure pages, targeting ≤ 20 pages total.
 */
export function buildBrochurePages({
    topTierProducts = [],
    catalogProducts = [],
    categories = [],
    compareProducts = [],
}) {
    const detailBySku = buildDetailBySku(compareProducts);
    const pages = [];
    let pageIndex = 0;

    const nextId = (prefix) => {
        pageIndex += 1;
        return `${prefix}-${pageIndex}`;
    };

    // Cover
    pages.push({ id: nextId('cover'), type: BROCHURE_PAGE_TYPES.COVER });

    // Top tier — hero-left layout, capacity 7 per page, max 2 pages
    const topTier = topTierProducts
        .map((p) => enrichProductFromMap(p, detailBySku))
        .filter((p) => p?.sku);

    const TOP_TIER_CAPACITY = 7;
    let topOffset = 0;
    let topPageNum = 0;
    while (topOffset < topTier.length && topPageNum < 2) {
        const slice = topTier.slice(topOffset, topOffset + TOP_TIER_CAPACITY);
        pages.push({
            id: nextId('top'),
            type: BROCHURE_PAGE_TYPES.TOP_TIER,
            chunkIndex: topPageNum,
            blocks: [{ category: '__top_tier__', products: slice, continued: topPageNum > 0 }],
            layout: LAYOUT_TYPES.HERO_LEFT,
            accent: 'gold',
        });
        topOffset += slice.length;
        topPageNum += 1;
    }

    // Catalog products — exclude top tier SKUs
    const catalogEnriched = catalogProducts
        .map((p) => enrichProductFromMap(p, detailBySku))
        .filter((p) => p?.sku);

    const topSkus = new Set(topTier.map((p) => String(p.sku).toUpperCase()));
    const rest = catalogEnriched.filter((p) => !topSkus.has(String(p.sku).toUpperCase()));
    const sections = groupProductsByCategory(rest, categories);

    const remainingMax = Math.max(1, 19 - pages.length);
    const packedPages = packProductBlocks(sections, { maxPages: remainingMax });

    packedPages.forEach((packed) => {
        pages.push({
            id: nextId('prod'),
            type: BROCHURE_PAGE_TYPES.PRODUCTS,
            blocks: packed.blocks,
            layout: packed.layout,
            accent: packed.accent,
        });
    });

    return {
        pages,
        stats: {
            totalPages: pages.length,
            topTierCount: topTier.length,
            categoryCount: sections.length,
            productCount: catalogEnriched.length,
        },
    };
}
