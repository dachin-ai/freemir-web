import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Input, Spin } from 'antd';
import { CloseOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '../api';
import LandingSubPageShell from '../components/landing/LandingSubPageShell';
import { useLandingCurrency } from '../hooks/useLandingCurrency';
import {
    ProductImage,
    ProductThumb,
    formatProductOriginalPrice,
    formatProductPrice,
    isZeroSalesProduct,
    productHasStrikethroughOriginal,
    normalizeInline,
    searchProducts,
} from '../components/landing/landingProductHelpers';
import { parseSkuBundleInput } from '../utils/skuIndex';
import './landing.css';

const MAX_COMPARE = 5;
const ADVANTAGE_SLOTS = 5;
const SLOT_INDICES = [0, 1, 2, 3, 4];

function cellValue(value) {
    const text = normalizeInline(value);
    return text || '—';
}

function normalizeSkuInput(raw) {
    return String(raw || '').trim().toUpperCase();
}

function CompareColGroup({ productCount }) {
    return (
        <colgroup>
            <col className="landing-compare-col-label" />
            {Array.from({ length: productCount }).map((_, idx) => (
                <col key={`compare-col-${idx}`} className="landing-compare-col-product" />
            ))}
        </colgroup>
    );
}

export default function CompareProductsPage() {
    const { t, i18n } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const hydratedRef = useRef(false);
    const [products, setProducts] = useState([]);
    const [picked, setPicked] = useState([]);
    const [skuInput, setSkuInput] = useState('');
    const [addError, setAddError] = useState('');
    const [currency, setCurrency] = useLandingCurrency();

    useEffect(() => {
        let cancelled = false;
        const scrollY = window.scrollY;
        if (!hydratedRef.current) {
            setLoading(true);
        } else {
            setRefreshing(true);
        }

        const lang = (i18n.language || 'id').slice(0, 2).toLowerCase();
        api.get('/public/landing-products', { params: { currency, lang, scope: 'compare' }, timeout: 60000 })
            .then((res) => {
                if (cancelled) return;
                setProducts(res.data?.compare_products || []);
                hydratedRef.current = true;
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                    setRefreshing(false);
                    requestAnimationFrame(() => {
                        window.scrollTo({ top: scrollY, left: 0 });
                    });
                }
            });
        return () => { cancelled = true; };
    }, [i18n.language, currency]);

    const mapBySku = useMemo(() => {
        const map = {};
        products.forEach((p) => {
            const key = normalizeSkuInput(p.sku);
            if (key) map[key] = p;
        });
        return map;
    }, [products]);

    const selected = picked.map((sku) => mapBySku[normalizeSkuInput(sku)]).filter(Boolean);
    const slots = SLOT_INDICES.map((i) => selected[i] || null);

    const suggestions = useMemo(() => {
        const q = skuInput.trim();
        if (!q) return [];
        return searchProducts(
            products.filter((p) => !picked.includes(normalizeSkuInput(p.sku))),
            q,
            6,
        );
    }, [products, skuInput, picked]);

    const addProduct = (productOrSku) => {
        const sku = typeof productOrSku === 'string'
            ? normalizeSkuInput(productOrSku)
            : normalizeSkuInput(productOrSku?.sku);
        if (!sku) return;

        if (picked.length >= MAX_COMPARE) {
            setAddError(t('landing.compareSkuMax', { max: MAX_COMPARE }));
            return;
        }
        if (picked.includes(sku)) {
            setAddError(t('landing.compareSkuDuplicate'));
            return;
        }
        if (!mapBySku[sku]) {
            setAddError(t('landing.compareSkuNotFound'));
            return;
        }

        setPicked((prev) => [...prev, sku]);
        setSkuInput('');
        setAddError('');
    };

    const addBundleSkus = (rawInput) => {
        const tokens = parseSkuBundleInput(rawInput);
        if (!tokens.length) {
            if (String(rawInput || '').trim()) {
                setAddError(t('landing.compareSkuNotFound'));
            }
            return;
        }

        const next = [...picked];
        const notFound = [];
        let added = 0;
        let stoppedByMax = false;

        for (const sku of tokens) {
            if (next.length >= MAX_COMPARE) {
                stoppedByMax = true;
                break;
            }
            if (next.includes(sku)) continue;
            if (!mapBySku[sku]) {
                notFound.push(sku);
                continue;
            }
            next.push(sku);
            added += 1;
        }

        setPicked(next);
        setSkuInput('');

        const messages = [];
        if (notFound.length) {
            messages.push(t('landing.compareSkuPartialNotFound', { skus: notFound.join(', ') }));
        }
        if (stoppedByMax) {
            messages.push(t('landing.compareSkuMax', { max: MAX_COMPARE }));
        }
        if (added === 0 && !messages.length) {
            messages.push(t('landing.compareSkuNotFound'));
        }
        setAddError(messages.join(' '));
    };

    const removeProduct = (sku) => {
        const key = normalizeSkuInput(sku);
        setPicked((prev) => prev.filter((x) => normalizeSkuInput(x) !== key));
        setAddError('');
    };

    const handleAddSubmit = () => {
        const q = skuInput.trim();
        if (!q) return;

        const bundleTokens = parseSkuBundleInput(q);
        if (bundleTokens.length > 1 || /[+\-,|/\\\s;]/.test(q)) {
            addBundleSkus(q);
            return;
        }

        const exact = mapBySku[normalizeSkuInput(q)];
        if (exact) {
            addProduct(exact);
            return;
        }
        if (suggestions.length === 1) {
            addProduct(suggestions[0]);
            return;
        }
        addBundleSkus(q);
    };

    const specRows = useMemo(() => {
        const rows = [
            {
                key: 'status',
                label: t('landing.compareStatusRow'),
                cell: 'status',
            },
            { key: 'category', label: t('landing.modal.category'), get: (p) => p.category_l1 },
            { key: 'subCategory', label: t('landing.modal.subCategory'), get: (p) => p.category_l2 },
            {
                key: 'originalPrice',
                label: t('landing.modal.originalPrice'),
                get: (p) => p.original_price,
                cell: 'original-price',
            },
            {
                key: 'discountPrice',
                label: t('landing.modal.discountPrice'),
                get: (p) => p.sale_price,
                cell: 'discount-price',
            },
            { key: 'color', label: t('landing.modal.color'), get: (p) => p.detail?.color },
            { key: 'mainMaterial', label: t('landing.modal.mainMaterial'), get: (p) => p.detail?.main_material },
            { key: 'subMaterial', label: t('landing.modal.subMaterial'), get: (p) => p.detail?.sub_material },
            { key: 'detailMaterial', label: t('landing.modal.detailMaterial'), get: (p) => p.detail?.detail_material },
            { key: 'dimensions', label: t('landing.modal.dimensions'), get: (p) => p.detail?.product_dimension_cm },
            { key: 'packageDimensions', label: t('landing.modal.packageDimensions'), get: (p) => p.detail?.package_dimension_cm },
            { key: 'grossWeight', label: t('landing.modal.grossWeight'), get: (p) => p.detail?.gross_weight_g },
            { key: 'weight', label: t('landing.modal.weight'), get: (p) => p.detail?.nett_weight_g },
            { key: 'notes', label: t('landing.modal.notes'), get: (p) => p.detail?.notes },
        ];

        rows.push({ key: 'adv-section', section: t('landing.compareSectionAdvantages') });

        for (let i = 0; i < ADVANTAGE_SLOTS; i += 1) {
            rows.push({
                key: `key-adv-${i}`,
                label: t('landing.compareKeyAdvantage', { n: i + 1 }),
                get: (p) => (p.detail?.advantages || [])[i],
                variant: 'advantage-key',
            });
            rows.push({
                key: `detail-adv-${i}`,
                label: t('landing.compareDetailAdvantage', { n: i + 1 }),
                get: (p) => (p.detail?.detail_advantages || [])[i],
                variant: 'advantage-detail',
            });
        }

        return rows;
    }, [t]);

    const canAddMore = picked.length < MAX_COMPARE;
    const comingSoon = t('landing.comingSoon');

    return (
        <LandingSubPageShell
            title={t('landing.compareTitle')}
            lead={t('landing.compareDesc')}
            currency={currency}
            onCurrencyChange={setCurrency}
        >
            <div className={`landing-compare-panel${refreshing ? ' landing-section-refreshing' : ''}`}>
                {loading && products.length === 0 ? (
                    <div className="landing-products-loading"><Spin /></div>
                ) : products.length === 0 ? (
                    <p className="landing-section-lead">{t('landing.catalogEmpty')}</p>
                ) : (
                    <>
                        <div className="landing-compare-workspace">
                            <div className="landing-compare-workspace-head">
                                <span className="landing-compare-workspace-label">
                                    {t('landing.compareAddTitle')}
                                </span>
                                <span className="landing-compare-slot-counter">
                                    {t('landing.compareSlotCounter', {
                                        count: picked.length,
                                        max: MAX_COMPARE,
                                    })}
                                </span>
                            </div>

                            <div className="landing-compare-slots" role="list">
                                {slots.map((product, index) => (
                                    <div
                                        key={`slot-${index}`}
                                        role="listitem"
                                        className={`landing-compare-slot${product ? ' is-filled' : ''}`}
                                    >
                                        <span className="landing-compare-slot-index">{index + 1}</span>
                                        {product ? (
                                            <>
                                                <p className="landing-compare-slot-name">{product.name}</p>
                                                <button
                                                    type="button"
                                                    className="landing-compare-slot-remove"
                                                    onClick={() => removeProduct(product.sku)}
                                                    aria-label={t('landing.compareRemoveProduct', {
                                                        name: product.name,
                                                    })}
                                                >
                                                    <CloseOutlined />
                                                </button>
                                            </>
                                        ) : (
                                            <span className="landing-compare-slot-empty">
                                                {t('landing.compareSlotEmpty')}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div className="landing-compare-add-bar">
                                <div className="landing-compare-search-field">
                                    <SearchOutlined className="landing-compare-search-icon" aria-hidden />
                                    <Input
                                        value={skuInput}
                                        onChange={(e) => {
                                            setSkuInput(e.target.value);
                                            setAddError('');
                                        }}
                                        onPressEnter={(e) => {
                                            e.preventDefault();
                                            handleAddSubmit();
                                        }}
                                        placeholder={t('landing.compareSkuPlaceholder')}
                                        allowClear
                                        bordered={false}
                                        size="large"
                                        className="landing-compare-search-input"
                                        disabled={!canAddMore}
                                        aria-autocomplete="list"
                                        aria-controls="compare-sku-suggestions"
                                    />
                                </div>
                                <button
                                    type="button"
                                    className="landing-btn landing-btn-primary landing-compare-add-btn"
                                    onClick={handleAddSubmit}
                                    disabled={!canAddMore || !skuInput.trim()}
                                >
                                    <PlusOutlined />
                                    {t('landing.compareAddButton')}
                                </button>
                            </div>

                            {addError && (
                                <p className="landing-compare-add-error" role="alert">{addError}</p>
                            )}

                            {skuInput.trim() && suggestions.length > 0 && canAddMore && (
                                <div
                                    id="compare-sku-suggestions"
                                    className="landing-compare-suggest-panel"
                                    role="listbox"
                                >
                                    {suggestions.map((p) => (
                                        <button
                                            key={p.sku}
                                            type="button"
                                            role="option"
                                            className="landing-compare-suggest-item"
                                            onClick={() => addProduct(p)}
                                        >
                                            <span className="landing-compare-suggest-media">
                                                <ProductThumb
                                                    src={p.image_url}
                                                    alt=""
                                                    className="landing-compare-suggest-thumb"
                                                />
                                            </span>
                                            <span className="landing-compare-suggest-meta">
                                                <span className="landing-compare-suggest-sku">{p.sku}</span>
                                                <span className="landing-compare-suggest-name">{p.name}</span>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {selected.length === 0 && (
                                <p className="landing-compare-workspace-hint">{t('landing.compareEmpty')}</p>
                            )}
                        </div>

                        {selected.length > 0 && (
                            <section className="landing-compare-results" aria-label={t('landing.compareResultsTitle')}>
                                <h2 className="landing-compare-results-title">{t('landing.compareResultsTitle')}</h2>
                                <div className="landing-compare-table-shell">
                                    <div className="landing-compare-table-x">
                                        <div
                                            className="landing-compare-table-sync"
                                            style={{ minWidth: 180 + selected.length * 160 }}
                                        >
                                            <table className="landing-compare-table landing-compare-table--head">
                                                <CompareColGroup productCount={selected.length} />
                                                <thead>
                                                    <tr>
                                                        <th className="landing-compare-label-col">
                                                            {t('landing.compareField')}
                                                        </th>
                                                        {selected.map((p) => (
                                                            <th key={p.sku} className="landing-compare-product-col">
                                                                <div className="landing-compare-product-head">
                                                                    <ProductImage
                                                                        src={p.image_url}
                                                                        alt={p.name}
                                                                        placeholderText={t('landing.photoNA')}
                                                                        className="landing-compare-head-img"
                                                                    />
                                                                    <span className="landing-compare-head-name">{p.name}</span>
                                                                </div>
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                            </table>
                                            <div className="landing-compare-table-body-scroll">
                                                <table className="landing-compare-table landing-compare-table--body">
                                                    <CompareColGroup productCount={selected.length} />
                                                    <tbody>
                                                        {specRows.map((row) => {
                                                            if (row.section) {
                                                                return (
                                                                    <tr key={row.key} className="landing-compare-section-row">
                                                                        <td colSpan={selected.length + 1}>{row.section}</td>
                                                                    </tr>
                                                                );
                                                            }
                                                            return (
                                                                <tr
                                                                    key={row.key}
                                                                    className={row.variant ? `is-${row.variant}` : undefined}
                                                                >
                                                                    <th scope="row" className="landing-compare-row-label">
                                                                        {row.label}
                                                                    </th>
                                                                    {selected.map((p) => {
                                                                        if (row.cell === 'original-price') {
                                                                            return (
                                                                                <td
                                                                                    key={`${row.key}-${p.sku}`}
                                                                                    className="landing-compare-price-original"
                                                                                >
                                                                                    {productHasStrikethroughOriginal(p)
                                                                                        ? formatProductOriginalPrice(p, currency)
                                                                                        : '—'}
                                                                                </td>
                                                                            );
                                                                        }
                                                                        if (row.cell === 'discount-price') {
                                                                            return (
                                                                                <td
                                                                                    key={`${row.key}-${p.sku}`}
                                                                                    className="landing-compare-price-disc"
                                                                                >
                                                                                    <span className={!p.has_price ? 'landing-compare-coming-soon' : undefined}>
                                                                                        {formatProductPrice(p, currency, comingSoon)}
                                                                                    </span>
                                                                                </td>
                                                                            );
                                                                        }
                                                                        if (row.cell === 'status') {
                                                                            return (
                                                                                <td key={`${row.key}-${p.sku}`}>
                                                                                    {isZeroSalesProduct(p) ? (
                                                                                        <span className="landing-compare-disc-badge">
                                                                                            {t('landing.learnDiscontinuedBadge')}
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="landing-compare-active-badge">
                                                                                            {t('landing.compareStatusActive')}
                                                                                        </span>
                                                                                    )}
                                                                                </td>
                                                                            );
                                                                        }
                                                                        return (
                                                                            <td key={`${row.key}-${p.sku}`}>
                                                                                {cellValue(row.get(p))}
                                                                            </td>
                                                                        );
                                                                    })}
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        )}
                    </>
                )}
            </div>
        </LandingSubPageShell>
    );
}
