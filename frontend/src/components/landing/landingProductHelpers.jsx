import React, { useEffect, useState } from 'react';
import { PictureOutlined } from '@ant-design/icons';

export function formatIdr(price) {
    if (price === null || price === undefined) return '—';
    const n = Number(price);
    if (!Number.isFinite(n)) return '—';
    return `Rp ${n.toLocaleString('id-ID')}`;
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

export function ProductImage({ src, alt, placeholderText = '', eager = false, className = '' }) {
    const [failed, setFailed] = useState(!src);
    useEffect(() => {
        setFailed(!src);
    }, [src]);
    if (failed || !src) {
        return (
            <div className={`landing-product-placeholder ${className}`.trim()}>
                <PictureOutlined />
                {placeholderText && <span className="landing-product-placeholder-text">{placeholderText}</span>}
            </div>
        );
    }
    return (
        <img
            className={className}
            src={src}
            alt={alt}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            onError={() => setFailed(true)}
        />
    );
}

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

function compareLearnProductOrder(a, b, activeFirst) {
    if (activeFirst) {
        const aDisc = isZeroSalesProduct(a) ? 1 : 0;
        const bDisc = isZeroSalesProduct(b) ? 1 : 0;
        if (aDisc !== bDisc) return aDisc - bDisc;
    }
    return compareSkuAsc(a, b);
}

export function groupProductsByCategory(products, { activeFirst = false } = {}) {
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
    return { categoryOrder, groups };
}

export function sortLearnBrowseProducts(products, { activeFirst = false } = {}) {
    return [...(products || [])].sort((a, b) => compareLearnProductOrder(a, b, activeFirst));
}
