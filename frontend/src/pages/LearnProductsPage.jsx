import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Collapse, Input, Spin } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '../api';
import LandingSubPageShell from '../components/landing/LandingSubPageShell';
import LandingProductDetailModal from '../components/landing/LandingProductDetailModal';
import { useLandingCurrency } from '../hooks/useLandingCurrency';
import {
    ProductImage,
    filterLearnBrowseProducts,
    groupProductsByCategory,
    sortCategoryOrderByProductCount,
    isZeroSalesProduct,
    scoreProductMatch,
    searchProducts,
} from '../components/landing/landingProductHelpers';
import '../pages/landing.css';

function LearnProductTile({ product, onSelect, photoNA, discontinuedLabel }) {
    const discontinued = isZeroSalesProduct(product);
    return (
        <button
            type="button"
            className={`landing-learn-tile${discontinued ? ' is-zero-sales' : ''}`}
            onClick={() => onSelect(product)}
        >
            <div className="landing-learn-tile-media">
                {discontinued && <span className="landing-learn-corner-mark" aria-hidden />}
                <ProductImage
                    src={product.image_url}
                    alt={product.name}
                    placeholderText={photoNA}
                    className="landing-learn-tile-img"
                />
            </div>
            <span className="landing-learn-tile-sku">{product.sku}</span>
            {discontinued && <span className="landing-learn-disc-label">{discontinuedLabel}</span>}
            <span className="landing-learn-tile-name">{product.name}</span>
        </button>
    );
}

function SuggestionRow({ product, onSelect, photoNA, discontinuedLabel }) {
    const discontinued = isZeroSalesProduct(product);
    return (
        <button type="button" className="landing-learn-suggest-item" onClick={() => onSelect(product)}>
            <div className="landing-learn-suggest-media">
                {discontinued && <span className="landing-learn-corner-mark" aria-hidden />}
                <ProductImage
                    src={product.image_url}
                    alt={product.name}
                    placeholderText={photoNA}
                    className="landing-learn-suggest-img"
                />
            </div>
            <div className="landing-learn-suggest-meta">
                <span className="landing-learn-suggest-sku">{product.sku}</span>
                {discontinued && <span className="landing-learn-disc-label">{discontinuedLabel}</span>}
                <span className="landing-learn-suggest-name">{product.name}</span>
            </div>
        </button>
    );
}

export default function LearnProductsPage() {
    const { t, i18n } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const hydratedRef = useRef(false);
    const [allProducts, setAllProducts] = useState([]);
    const [query, setQuery] = useState('');
    const [expandedKeys, setExpandedKeys] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);
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
        api.get('/public/landing-products', { params: { currency, lang, scope: 'learn' }, timeout: 60000 })
            .then((res) => {
                if (cancelled) return;
                setAllProducts(res.data?.browse_products || res.data?.all_products || []);
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

    const browseProducts = useMemo(
        () => filterLearnBrowseProducts(allProducts),
        [allProducts],
    );

    const learnSort = { activeFirst: true };

    const { categoryOrder, groups } = useMemo(
        () => groupProductsByCategory(browseProducts, learnSort),
        [browseProducts],
    );

    const suggestions = useMemo(
        () => searchProducts(browseProducts, query, 8, learnSort),
        [browseProducts, query],
    );

    const filtered = useMemo(() => {
        const q = query.trim();
        if (!q) return { categoryOrder, groups };
        const nextGroups = {};
        const nextOrder = [];
        categoryOrder.forEach((cat) => {
            const items = (groups[cat] || []).filter((p) => scoreProductMatch(p, q) > 0);
            if (items.length) {
                nextGroups[cat] = items;
                nextOrder.push(cat);
            }
        });
        return {
            categoryOrder: sortCategoryOrderByProductCount(nextOrder, nextGroups),
            groups: nextGroups,
        };
    }, [categoryOrder, groups, query]);

    useEffect(() => {
        if (query.trim()) {
            setExpandedKeys(filtered.categoryOrder);
        } else {
            setExpandedKeys([]);
        }
    }, [query, filtered.categoryOrder]);

    const openProduct = (product) => {
        setSelectedProduct(product);
        setQuery('');
    };

    const collapseItems = filtered.categoryOrder.map((cat) => ({
        key: cat,
        label: (
            <span className="landing-learn-collapse-label">
                {cat}
                <span className="landing-learn-collapse-count">{filtered.groups[cat]?.length || 0}</span>
            </span>
        ),
        children: (
            <div className="landing-learn-grid">
                {(filtered.groups[cat] || []).map((p) => (
                    <LearnProductTile
                        key={p.sku}
                        product={p}
                        onSelect={setSelectedProduct}
                        photoNA={t('landing.photoNA')}
                        discontinuedLabel={t('landing.learnDiscontinuedBadge')}
                    />
                ))}
            </div>
        ),
    }));

    return (
        <LandingSubPageShell
            title={t('landing.learnProductTitle')}
            lead={t('landing.learnProductDesc')}
            currency={currency}
            onCurrencyChange={setCurrency}
        >
            <div className={`landing-learn-panel${refreshing ? ' landing-section-refreshing' : ''}`}>
            <div className="landing-learn-search-area">
                <div className="landing-learn-search-field">
                    <SearchOutlined className="landing-learn-search-icon" aria-hidden />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t('landing.learnSearchPlaceholder')}
                        allowClear
                        bordered={false}
                        size="large"
                        className="landing-learn-search-input"
                        aria-autocomplete="list"
                        aria-controls="learn-product-suggestions"
                    />
                </div>
                {query.trim() && suggestions.length > 0 && (
                    <div id="learn-product-suggestions" className="landing-learn-suggest-panel" role="listbox">
                        <p className="landing-learn-suggest-title">{t('landing.learnSuggestions')}</p>
                        <div className="landing-learn-suggest-list">
                            {suggestions.map((p) => (
                                <SuggestionRow
                                    key={p.sku}
                                    product={p}
                                    onSelect={openProduct}
                                    photoNA={t('landing.photoNA')}
                                    discontinuedLabel={t('landing.learnDiscontinuedBadge')}
                                />
                            ))}
                        </div>
                    </div>
                )}
                {query.trim() && suggestions.length === 0 && !loading && (
                    <p className="landing-learn-suggest-empty">{t('landing.learnNoResults')}</p>
                )}
            </div>

            {loading && allProducts.length === 0 ? (
                <div className="landing-products-loading"><Spin /></div>
            ) : browseProducts.length === 0 ? (
                <p className="landing-section-lead">{t('landing.catalogEmpty')}</p>
            ) : (
                <>
                    <p className="landing-learn-hint">{t('landing.learnBrowseHint')}</p>
                    <Collapse
                        className="landing-learn-collapse"
                        activeKey={expandedKeys}
                        onChange={(keys) => setExpandedKeys(Array.isArray(keys) ? keys : [keys])}
                        items={collapseItems}
                    />
                </>
            )}
            </div>

            <LandingProductDetailModal
                product={selectedProduct}
                onClose={() => setSelectedProduct(null)}
                currency={currency}
            />
        </LandingSubPageShell>
    );
}
