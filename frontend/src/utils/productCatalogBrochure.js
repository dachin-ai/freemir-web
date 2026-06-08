/**
 * Build paginated A4-landscape brochure pages from landing + compare API payloads.
 */

export const BROCHURE_PAGE_TYPES = {
    COVER: 'cover',
    TOP_TIER: 'top-tier',
    PRODUCTS: 'products',
    CONTACT: 'contact',
};

export const LAYOUT_TYPES = {
    FIVE_COL: 'five-col',
    HERO_LEFT: 'hero-left',
    FOUR_COL: 'four-col',
    THREE_COL: 'three-col',
};

export const LAYOUT_COLUMNS = {
    [LAYOUT_TYPES.FIVE_COL]: 5,
    [LAYOUT_TYPES.HERO_LEFT]: 2,
    [LAYOUT_TYPES.FOUR_COL]: 4,
    [LAYOUT_TYPES.THREE_COL]: 3,
};

const LAYOUT_CAPACITIES = {
    [LAYOUT_TYPES.FIVE_COL]: 10,
    [LAYOUT_TYPES.HERO_LEFT]: 5,
    [LAYOUT_TYPES.FOUR_COL]: 8,
    [LAYOUT_TYPES.THREE_COL]: 6,
};

const CATALOG_LAYOUT = LAYOUT_TYPES.FOUR_COL;
const CATALOG_CAPACITY = LAYOUT_CAPACITIES[CATALOG_LAYOUT];

const CATALOG_ACCENTS = ['blue', 'blue', 'pink', 'blue', 'blue', 'pink', 'blue', 'blue'];

/** Categories with fewer products are pooled and packed at the end of the catalog. */
const SMALL_SERIES_THRESHOLD = 6;

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

function countPageProducts(page) {
    return (page.blocks || []).reduce((n, b) => n + (b.products?.length || 0), 0);
}

function appendProductToBlocks(blocks, category, product, continued) {
    const last = blocks[blocks.length - 1];
    if (last && last.category === category) {
        last.products.push(product);
        return;
    }
    blocks.push({
        category,
        products: [product],
        continued: Boolean(continued),
    });
}

function mergePageBlocks(targetBlocks, sourceBlocks) {
    const out = targetBlocks.map((b) => ({
        category: b.category,
        continued: b.continued,
        products: [...b.products],
    }));

    for (const block of sourceBlocks) {
        const last = out[out.length - 1];
        if (last && last.category === block.category) {
            last.products.push(...block.products);
        } else {
            const continued = last
                ? block.continued || last.category === block.category
                : block.continued;
            out.push({
                category: block.category,
                continued,
                products: [...block.products],
            });
        }
    }
    return out;
}

function mergeSparsePages(pages, { minFill = 6, capacity = CATALOG_CAPACITY } = {}) {
    const merged = pages.map((p) => ({
        ...p,
        blocks: p.blocks.map((b) => ({
            category: b.category,
            continued: b.continued,
            products: [...b.products],
        })),
    }));

    let changed = true;
    while (changed) {
        changed = false;
        for (let i = merged.length - 1; i > 0; i -= 1) {
            const curCount = countPageProducts(merged[i]);
            const prevCount = countPageProducts(merged[i - 1]);
            if (curCount > 0 && curCount < minFill && prevCount + curCount <= capacity) {
                merged[i - 1].blocks = mergePageBlocks(merged[i - 1].blocks, merged[i].blocks);
                merged.splice(i, 1);
                changed = true;
                break;
            }
        }
    }
    return merged;
}

function packSectionsIntoPages(sections, pageIdxStart = 0) {
    const entries = [];
    for (const { category, products } of sections) {
        for (const product of products) {
            entries.push({ category, product });
        }
    }

    const pages = [];
    let pageIdx = pageIdxStart;
    let lastCategoryOnPrevPage = null;

    for (let i = 0; i < entries.length; i += CATALOG_CAPACITY) {
        const slice = entries.slice(i, i + CATALOG_CAPACITY);
        const blocks = [];

        for (const { category, product } of slice) {
            const isFirstOnPage = blocks.length === 0
                || blocks[blocks.length - 1].category !== category;
            const continued = isFirstOnPage && category === lastCategoryOnPrevPage;
            appendProductToBlocks(blocks, category, product, continued);
        }

        lastCategoryOnPrevPage = slice[slice.length - 1]?.category ?? null;

        pages.push({
            blocks,
            layout: CATALOG_LAYOUT,
            accent: CATALOG_ACCENTS[pageIdx % CATALOG_ACCENTS.length],
        });
        pageIdx += 1;
    }

    return { pages, nextPageIdx: pageIdx };
}

/**
 * Pack catalog products into uniform 4×2 pages.
 * Series with ≥6 products keep catalog order up front; smaller series are
 * merged together and placed at the bottom to avoid sparse pages mid-catalog.
 */
export function packProductBlocks(sections, { maxPages = 17 } = {}) {
    const majorSections = sections.filter((s) => s.products.length >= SMALL_SERIES_THRESHOLD);
    const minorSections = sections.filter((s) => s.products.length < SMALL_SERIES_THRESHOLD);

    const { pages: majorPages, nextPageIdx } = packSectionsIntoPages(majorSections, 0);
    const denseMajor = mergeSparsePages(majorPages);

    const { pages: minorPages } = packSectionsIntoPages(minorSections, nextPageIdx);
    const denseMinor = mergeSparsePages(minorPages);

    return [...denseMajor, ...denseMinor].slice(0, maxPages);
}

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

    pages.push({ id: nextId('cover'), type: BROCHURE_PAGE_TYPES.COVER });

    const topTier = topTierProducts
        .map((p) => enrichProductFromMap(p, detailBySku))
        .filter((p) => p?.sku);

    const TOP_TIER_CAPACITY = 5;
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

    const catalogEnriched = catalogProducts
        .map((p) => enrichProductFromMap(p, detailBySku))
        .filter((p) => p?.sku);

    const topSkus = new Set(topTier.map((p) => String(p.sku).toUpperCase()));
    const rest = catalogEnriched.filter((p) => !topSkus.has(String(p.sku).toUpperCase()));
    const sections = groupProductsByCategory(rest, categories);

    const remainingMax = Math.max(1, 18 - pages.length);
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

    pages.push({ id: nextId('contact'), type: BROCHURE_PAGE_TYPES.CONTACT, accent: 'blue' });

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
