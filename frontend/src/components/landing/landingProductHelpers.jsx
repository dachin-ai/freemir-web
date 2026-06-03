import React, { memo, useEffect, useState } from 'react';
import { PictureOutlined } from '@ant-design/icons';
import { formatPrice } from '../../utils/currencyStorage';
import ProtectedProductMedia, { PROTECT_MEDIA_PROPS } from './ProtectedProductMedia';
/** @deprecated Prefer formatProductPrice with currency + has_price. */
export function formatIdr(price) {
    if (price === null || price === undefined) return '—';
    const n = Number(price);
    if (!Number.isFinite(n)) return '—';
    return `Rp ${n.toLocaleString('id-ID')}`;
}

export function formatProductPrice(product, currency, comingSoonLabel) {
    if (!product?.has_price) return comingSoonLabel || 'Coming soon';
    return formatPrice(product.sale_price, currency);
}

export function formatProductOriginalPrice(product, currency) {
    if (product?.original_price == null) return '—';
    return formatPrice(product.original_price, currency);
}

export function productHasStrikethroughOriginal(product) {
    if (product?.original_price == null) return false;
    if (!product?.has_price) return true;
    return Number(product.original_price) > Number(product.sale_price);
}

export function discountBadge(product) {
    const pct = Number(product?.discount_percent || 0);
    if (!pct || pct <= 0) return null;
    return <span className="landing-discount-badge">-{pct}%</span>;
}

export function normalizeInline(text) {
    return String(text || '').replace(/\s*\n+\s*/g, ' x ').replace(/\s{2,}/g, ' ').trim();
}

export function normProductStatus(status) {
    return String(status || '').replace(/[\s_\-]+/g, '').toLowerCase();
}

const HIDDEN_PUBLIC_STATUSES = new Set(['later', 'nonfreemir']);

/** Not shown on landing catalog, learn page, or search. */
export function isPublicCatalogProduct(product) {
    return !HIDDEN_PUBLIC_STATUSES.has(normProductStatus(product?.status));
}

/** Learn page browse pool (active + discontinued zero sales). */
export function isLearnBrowseProduct(product) {
    return isPublicCatalogProduct(product);
}

export function isZeroSalesProduct(product) {
    return normProductStatus(product?.status) === 'zerosales';
}

export function filterLearnBrowseProducts(products) {
    return (products || []).filter(isLearnBrowseProduct);
}

export const ProductImage = memo(function ProductImage({
    src,
    alt,
    placeholderText = '',
    eager = false,
    className = '',
    protectedMedia = true,
    prominentWatermark = false,
    liteWatermark = !prominentWatermark,
}) {
    const [failed, setFailed] = useState(!src);
    useEffect(() => {
        setFailed(!src);
    }, [src]);

    const wrap = (content) => (
        <ProtectedProductMedia
            className={className}
            prominent={prominentWatermark}
            enabled={protectedMedia}
            lite={liteWatermark}
        >
            {content}
        </ProtectedProductMedia>
    );

    if (failed || !src) {
        return wrap(
            <div className="landing-product-placeholder">
                <PictureOutlined />
                {placeholderText && <span className="landing-product-placeholder-text">{placeholderText}</span>}
            </div>,
        );
    }

    return wrap(
        <img
            className="landing-protected-media-img"
            src={src}
            alt={alt}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            {...PROTECT_MEDIA_PROPS}
            onError={() => setFailed(true)}
        />,
    );
});

export function scoreProductMatch(product, query) {
    const q = query.trim().toLowerCase();
    if (!q) return 0;
    const sku = String(product?.sku || '').toLowerCase();
    const name = String(product?.name || '').toLowerCase();
    if (sku === q) return 100;
    if (sku.startsWith(q)) return 90;
    if (name === q) return 85;
    if (sku.includes(q)) return 70;
    if (name.startsWith(q)) return 60;
    if (name.includes(q)) return 50;
    const tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length > 1 && tokens.every((t) => name.includes(t) || sku.includes(t))) return 40;
    return 0;
}

export function searchProducts(products, query, limit = 8, { activeFirst = false } = {}) {
    const q = query.trim();
    if (!q) return [];
    return products
        .map((p) => ({ product: p, score: scoreProductMatch(p, q) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return compareLearnProductOrder(a.product, b.product, activeFirst);
        })
        .slice(0, limit)
        .map(({ product }) => product);
}

export function compareSkuAsc(a, b) {
    const sa = String(a?.sku || '').toUpperCase();
    const sb = String(b?.sku || '').toUpperCase();
    return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
}

/** Priced products first, then Coming Soon; optional active-before-discontinued. */
export function compareProductCatalogOrder(a, b, { activeFirst = false } = {}) {
    const aPriced = a?.has_price ? 0 : 1;
    const bPriced = b?.has_price ? 0 : 1;
    if (aPriced !== bPriced) return aPriced - bPriced;
    if (activeFirst) {
        const aDisc = isZeroSalesProduct(a) ? 1 : 0;
        const bDisc = isZeroSalesProduct(b) ? 1 : 0;
        if (aDisc !== bDisc) return aDisc - bDisc;
    }
    return compareSkuAsc(a, b);
}

function compareLearnProductOrder(a, b, activeFirst) {
    return compareProductCatalogOrder(a, b, { activeFirst });
}

export function sortCategoryOrderByProductCount(categoryOrder, groups) {
    return [...categoryOrder].sort((a, b) => {
        const diff = (groups[b]?.length || 0) - (groups[a]?.length || 0);
        if (diff !== 0) return diff;
        return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
    });
}

export function groupProductsByCategory(products, { activeFirst = false, sortCategoriesByCount = true } = {}) {
    const sorted = [...products].sort((a, b) => compareLearnProductOrder(a, b, activeFirst));
    const categoryOrder = [];
    const groups = {};
    sorted.forEach((item) => {
        const key = item.category_l2 || item.category_l1 || 'Other';
        if (!groups[key]) {
            groups[key] = [];
            categoryOrder.push(key);
        }
        groups[key].push(item);
    });
    const order = sortCategoriesByCount
        ? sortCategoryOrderByProductCount(categoryOrder, groups)
        : categoryOrder;
    return { categoryOrder: order, groups };
}

export function sortLearnBrowseProducts(products, { activeFirst = false } = {}) {
    return [...(products || [])].sort((a, b) => compareLearnProductOrder(a, b, activeFirst));
}
