import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowLeftOutlined,
    DownloadOutlined,
    LeftOutlined,
    RightOutlined,
    MoonOutlined,
    SunOutlined,
} from '@ant-design/icons';
import { Spin } from 'antd';
import api from '../api';
import LanguageSwitch from '../components/LanguageSwitch';
import LandingCurrencySwitch from '../components/landing/LandingCurrencySwitch';
import BrochureProductCard from '../components/landing/BrochureProductCard';
import { useLandingCurrency } from '../hooks/useLandingCurrency';
import { useTheme } from '../context/ThemeContext';
import {
    BROCHURE_PAGE_TYPES,
    LAYOUT_TYPES,
    buildBrochurePages,
} from '../utils/productCatalogBrochure';
import './product-catalog-brochure.css';

const TOP_TIER_KEY = '__top_tier__';

/* ── Helpers ── */
function getAllProducts(blocks) {
    return (blocks || []).flatMap((b) => b.products || []);
}

function getCategories(blocks) {
    return [...new Set(
        (blocks || []).map((b) => b.category).filter((c) => c && c !== TOP_TIER_KEY),
    )];
}

function flattenToItems(blocks, skipCatLabels = false) {
    const items = [];
    let lastCat = null;
    for (const block of (blocks || [])) {
        if (!skipCatLabels && block.category !== TOP_TIER_KEY && block.category !== lastCat) {
            items.push({ type: 'cat', label: block.category, continued: block.continued });
            lastCat = block.category;
        }
        for (const p of (block.products || [])) {
            items.push({ type: 'product', product: p });
        }
    }
    return items;
}

/* ── Page header (navy bar) ── */
function PageHeader({ categories, accent, label, t }) {
    const catStr = categories.slice(0, 4).join(' · ');
    return (
        <header className="brochure-page-header" data-accent={accent || 'blue'}>
            <div className="brochure-header-left">
                <img src="/logo.png" alt="freemir" className="brochure-header-logo" />
                {catStr && <span className="brochure-header-cats">{catStr}</span>}
            </div>
            <div className="brochure-header-right">
                {label && <span className="brochure-header-badge">{label}</span>}
                <span className="brochure-header-brand">freemir</span>
            </div>
        </header>
    );
}

/* ── Flat grid (5-col, 4-col, or 3-col) ── */
function FlatGrid({ blocks, gridClass, cardVariant, accent, currency, comingSoon }) {
    const items = flattenToItems(blocks);
    return (
        <div className={`${gridClass}`}>
            {items.map((item, i) => {
                if (item.type === 'cat') {
                    return (
                        <div key={`cat-${i}`} className="brochure-inline-cat">
                            <span className="brochure-inline-cat-text">
                                {item.label}{item.continued ? ' ›' : ''}
                            </span>
                            <span className="brochure-inline-cat-bar" />
                        </div>
                    );
                }
                return (
                    <BrochureProductCard
                        key={item.product.sku}
                        product={item.product}
                        currency={currency}
                        comingSoon={comingSoon}
                        variant={cardVariant}
                    />
                );
            })}
        </div>
    );
}

/* ══════════════════════════════════════
   LAYOUT RENDERERS
   ══════════════════════════════════════ */

/** Five-col: 5 × 2 compact cards */
function FiveColPage({ page, currency, comingSoon, t }) {
    return (
        <div className="brochure-page-inner" data-accent={page.accent}>
            <PageHeader categories={getCategories(page.blocks)} accent={page.accent} t={t} />
            <div className="brochure-page-body">
                <FlatGrid
                    blocks={page.blocks}
                    gridClass="brochure-grid-5"
                    cardVariant="compact"
                    accent={page.accent}
                    currency={currency}
                    comingSoon={comingSoon}
                />
            </div>
        </div>
    );
}

/** Four-col: 4 × 2 standard cards */
function FourColPage({ page, currency, comingSoon, t }) {
    return (
        <div className="brochure-page-inner" data-accent={page.accent}>
            <PageHeader categories={getCategories(page.blocks)} accent={page.accent} t={t} />
            <div className="brochure-page-body">
                <FlatGrid
                    blocks={page.blocks}
                    gridClass="brochure-grid-4"
                    cardVariant="standard"
                    accent={page.accent}
                    currency={currency}
                    comingSoon={comingSoon}
                />
            </div>
        </div>
    );
}

/** Three-col: 3 × 2 large cards (most detail visible) */
function ThreeColPage({ page, currency, comingSoon, t }) {
    return (
        <div className="brochure-page-inner" data-accent={page.accent}>
            <PageHeader categories={getCategories(page.blocks)} accent={page.accent} t={t} />
            <div className="brochure-page-body">
                <FlatGrid
                    blocks={page.blocks}
                    gridClass="brochure-grid-3"
                    cardVariant="large"
                    accent={page.accent}
                    currency={currency}
                    comingSoon={comingSoon}
                />
            </div>
        </div>
    );
}

/** Hero-left: 1 large hero (dark panel) + 3×2 standard cards */
function HeroLeftPage({ page, currency, comingSoon, t, isTopTier }) {
    const allProds = getAllProducts(page.blocks);
    const hero = allProds[0];
    const compact = allProds.slice(1, 7);
    const cats = isTopTier ? [] : getCategories(page.blocks);
    const accent = page.accent || 'blue';
    const label = isTopTier ? t('landing.brochureTopTierEyebrow') : null;

    return (
        <div className="brochure-page-inner" data-accent={accent}>
            <PageHeader categories={cats} accent={accent} label={label} t={t} />
            <div className="brochure-page-body">
                <div className="brochure-hero-left-body">
                    {/* Hero panel */}
                    <div className="brochure-hero-panel" data-accent={accent}>
                        <div className="brochure-hero-panel-inner">
                            {isTopTier && (
                                <div className="brochure-hero-eyebrow">
                                    {t('landing.brochureFeatured')}
                                </div>
                            )}
                            {hero && (
                                <BrochureProductCard
                                    product={hero}
                                    currency={currency}
                                    comingSoon={comingSoon}
                                    variant="hero"
                                    isTopTier={isTopTier}
                                />
                            )}
                        </div>
                    </div>
                    {/* Compact grid */}
                    <div className="brochure-compact-panel">
                        <div className="brochure-grid-3" style={{ height: '100%' }}>
                            {compact.map((p) => (
                                <BrochureProductCard
                                    key={p.sku}
                                    product={p}
                                    currency={currency}
                                    comingSoon={comingSoon}
                                    variant="standard"
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ══════════════════════════════════════
   COVER PAGE — navy panel + image
   ══════════════════════════════════════ */
function CoverPage({ t }) {
    return (
        <div className="brochure-cover">
            <div className="brochure-cover-panel">
                <div className="brochure-cover-panel-inner">
                    <img src="/logo.png" alt="freemir" className="brochure-cover-logo" />
                    <p className="brochure-cover-eyebrow">{t('landing.brochureCoverEyebrow')}</p>
                    <h1 className="brochure-cover-title">
                        {t('landing.brochureCoverTitle')}
                    </h1>
                    <p className="brochure-cover-sub">{t('landing.brochureCoverSub')}</p>
                    <div className="brochure-cover-spacer" />
                    <div className="brochure-cover-footer">
                        <span className="brochure-cover-year">2024 – 2025</span>
                        <span className="brochure-cover-tagline">Premium Kitchen Solutions</span>
                    </div>
                </div>
                <div className="brochure-cover-divider" />
            </div>
            <div
                className="brochure-cover-image"
                style={{ backgroundImage: 'url(/Kitchen_BG.png)' }}
            />
        </div>
    );
}

/* ══════════════════════════════════════
   PAGE DISPATCHER
   ══════════════════════════════════════ */
function BrochurePageContent({ page, currency, comingSoon, t }) {
    if (page.type === BROCHURE_PAGE_TYPES.COVER) {
        return <CoverPage t={t} />;
    }

    if (page.type === BROCHURE_PAGE_TYPES.TOP_TIER) {
        return (
            <HeroLeftPage
                page={page}
                currency={currency}
                comingSoon={comingSoon}
                t={t}
                isTopTier
            />
        );
    }

    switch (page.layout) {
        case LAYOUT_TYPES.HERO_LEFT:
            return <HeroLeftPage page={page} currency={currency} comingSoon={comingSoon} t={t} />;
        case LAYOUT_TYPES.FOUR_COL:
            return <FourColPage page={page} currency={currency} comingSoon={comingSoon} t={t} />;
        case LAYOUT_TYPES.THREE_COL:
            return <ThreeColPage page={page} currency={currency} comingSoon={comingSoon} t={t} />;
        default:
            return <FiveColPage page={page} currency={currency} comingSoon={comingSoon} t={t} />;
    }
}

/* ══════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════ */
export default function ProductCatalogBrochure() {
    const { t, i18n } = useTranslation();
    const { isDark, toggleTheme } = useTheme();
    const [loading, setLoading] = useState(true);
    const [topTier, setTopTier] = useState([]);
    const [catalogProducts, setCatalogProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [compareProducts, setCompareProducts] = useState([]);
    const [activePage, setActivePage] = useState(0);
    const [currency, setCurrency] = useLandingCurrency();
    const sheetRefs = useRef([]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        const lang = (i18n.language || 'id').slice(0, 2).toLowerCase();

        Promise.all([
            api.get('/public/landing-products', { params: { currency, lang, scope: 'landing' }, timeout: 60000 }),
            api.get('/public/landing-products', { params: { currency, lang, scope: 'compare' }, timeout: 60000 }),
        ])
            .then(([landingRes, compareRes]) => {
                if (cancelled) return;
                const landing = landingRes.data || {};
                setTopTier(landing.top_tier_products || []);
                setCatalogProducts(landing.products || []);
                setCategories(landing.categories || []);
                setCompareProducts(compareRes.data?.compare_products || []);
                setActivePage(0);
            })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [i18n.language, currency]);

    const { pages } = useMemo(
        () => buildBrochurePages({ topTierProducts: topTier, catalogProducts, categories, compareProducts }),
        [topTier, catalogProducts, categories, compareProducts],
    );

    const comingSoon = t('landing.comingSoon');
    const totalPages = pages.length;
    const currentPage = Math.min(activePage, Math.max(0, totalPages - 1));

    const goToPage = (index) => {
        const next = Math.max(0, Math.min(index, totalPages - 1));
        setActivePage(next);
        sheetRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    useEffect(() => {
        sheetRefs.current = sheetRefs.current.slice(0, pages.length);
    }, [pages.length]);

    return (
        <div className="brochure-viewer-root" data-theme={isDark ? 'dark' : 'light'}>
            <header className="brochure-viewer-toolbar no-print">
                <Link to="/" className="brochure-viewer-back">
                    <ArrowLeftOutlined />
                    {t('landing.backToHome')}
                </Link>
                <div className="brochure-viewer-actions">
                    <LandingCurrencySwitch currency={currency} onChange={setCurrency} />
                    <LanguageSwitch />
                    <button
                        type="button"
                        className="landing-btn-ghost"
                        onClick={toggleTheme}
                        aria-label="Toggle theme"
                    >
                        {isDark ? <SunOutlined /> : <MoonOutlined />}
                    </button>
                    <button
                        type="button"
                        className="landing-btn landing-btn-primary"
                        onClick={() => window.print()}
                    >
                        <DownloadOutlined />
                        {t('landing.brochureDownload')}
                    </button>
                </div>
            </header>

            <div className="brochure-viewer-pager no-print">
                <button
                    type="button"
                    className="brochure-pager-btn"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage <= 0}
                    aria-label={t('landing.brochurePrevPage')}
                >
                    <LeftOutlined />
                </button>
                <span className="brochure-pager-label">
                    {t('landing.brochurePageOf', { current: currentPage + 1, total: totalPages || 1 })}
                </span>
                <button
                    type="button"
                    className="brochure-pager-btn"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage >= totalPages - 1}
                    aria-label={t('landing.brochureNextPage')}
                >
                    <RightOutlined />
                </button>
            </div>

            {loading ? (
                <div className="brochure-viewer-loading no-print">
                    <Spin size="large" />
                </div>
            ) : (
                <div className="brochure-viewer-stage">
                    <div className="brochure-pages-track">
                        {pages.map((page, index) => (
                            <section
                                key={page.id}
                                ref={(el) => { sheetRefs.current[index] = el; }}
                                className={`brochure-sheet${index === currentPage ? ' is-active' : ''}`}
                                onMouseEnter={() => setActivePage(index)}
                            >
                                <BrochurePageContent
                                    page={page}
                                    currency={currency}
                                    comingSoon={comingSoon}
                                    t={t}
                                />
                            </section>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
