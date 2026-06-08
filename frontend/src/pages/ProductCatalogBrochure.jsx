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
import CountryFlag from '../components/CountryFlag';
import SocialIcon from '../components/SocialIcon';
import {
    LANDING_BROCHURE_SOCIAL,
    LANDING_CONTACT_ADDRESS_KEY,
    LANDING_CONTACT_MAPS_URL,
    LANDING_CONTACT_REGIONS,
    LANDING_OFFICIAL_STORE_URL,
    LANDING_SHOPEE_STORE_URL,
} from '../data/landingContact';
import './product-catalog-brochure.css';

const TOP_TIER_KEY = '__top_tier__';

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
        const showCatLabel = !skipCatLabels
            && block.category !== TOP_TIER_KEY
            && (block.category !== lastCat || block.continued);
        const products = block.products || [];
        products.forEach((p, idx) => {
            items.push({
                type: 'product',
                product: p,
                categoryLabel: showCatLabel && idx === 0
                    ? { label: block.category, continued: Boolean(block.continued) }
                    : null,
            });
        });
        if (!skipCatLabels && block.category !== TOP_TIER_KEY) {
            lastCat = block.category;
        }
    }
    return items;
}

function PageHeader({ categories, accent, label, t }) {
    const catStr = categories.slice(0, 3).join(' · ');
    return (
        <header className="brochure-page-header" data-accent={accent || 'blue'}>
            <div className="brochure-header-brand-row">
                <img src="/logo.png" alt="freemir" className="brochure-header-logo" />
                <span className="brochure-header-doc-title">{t('landing.brochureDocTitle')}</span>
            </div>
            <div className="brochure-header-meta">
                {label && <span className="brochure-header-badge">{label}</span>}
                {catStr ? <span className="brochure-header-cats">{catStr}</span> : null}
            </div>
            <span className="brochure-header-accent" aria-hidden />
        </header>
    );
}

function PageFooter({ pageNum, totalPages, t }) {
    return (
        <footer className="brochure-page-footer">
            <div className="brochure-footer-left">
                <span className="brochure-footer-brand">freemir</span>
                <span className="brochure-footer-dot" aria-hidden />
                <span className="brochure-footer-tagline">{t('landing.brochureFooterTagline')}</span>
            </div>
            <span className="brochure-footer-page">
                {t('landing.brochurePageLabel')} {pageNum}
                <span className="brochure-footer-page-sep">/</span>
                {totalPages}
            </span>
        </footer>
    );
}

function InlineCategoryLabel({ label, continued, accent, t }) {
    return (
        <div className="brochure-inline-cat-head" data-accent={accent}>
            <span className="brochure-inline-cat-eyebrow">{t('landing.brochureCategoryEyebrow')}</span>
            <span className="brochure-inline-cat-name">
                {label}
                {continued ? (
                    <span className="brochure-inline-cat-cont">
                        {' '}
                        · {t('landing.brochureContinued')}
                    </span>
                ) : null}
            </span>
        </div>
    );
}

function FlatGrid({ blocks, gridClass, cardVariant, accent, currency, comingSoon, t }) {
    const items = flattenToItems(blocks);
    const cols = gridClass === 'brochure-grid-4' ? 4 : 0;
    const sparse = cols > 0 && items.length > 0 && items.length < cols;
    const rows = cols > 0 ? Math.ceil(items.length / cols) : 0;
    const gridStyle = cols > 0 && !sparse && rows > 0
        ? { gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }
        : undefined;
    const gridClassName = sparse ? `${gridClass} ${gridClass}--sparse` : gridClass;
    return (
        <div className={gridClassName} style={gridStyle}>
            {items.map((item) => (
                <div key={item.product.sku} className="brochure-grid-cell">
                    {item.categoryLabel ? (
                        <InlineCategoryLabel
                            label={item.categoryLabel.label}
                            continued={item.categoryLabel.continued}
                            accent={accent}
                            t={t}
                        />
                    ) : null}
                    <BrochureProductCard
                        product={item.product}
                        currency={currency}
                        comingSoon={comingSoon}
                        variant={cardVariant}
                    />
                </div>
            ))}
        </div>
    );
}

function ContentPageShell({ page, currency, comingSoon, t, pageNum, totalPages, children }) {
    return (
        <div className="brochure-page-inner" data-accent={page.accent}>
            <PageHeader
                categories={getCategories(page.blocks)}
                accent={page.accent}
                label={page.headerLabel}
                t={t}
            />
            <div className="brochure-page-body">{children}</div>
            <PageFooter pageNum={pageNum} totalPages={totalPages} t={t} />
        </div>
    );
}

function FiveColPage({ page, currency, comingSoon, t, pageNum, totalPages }) {
    return (
        <ContentPageShell page={page} currency={currency} comingSoon={comingSoon} t={t} pageNum={pageNum} totalPages={totalPages}>
            <FlatGrid
                blocks={page.blocks}
                gridClass="brochure-grid-5"
                cardVariant="compact"
                accent={page.accent}
                currency={currency}
                comingSoon={comingSoon}
                t={t}
            />
        </ContentPageShell>
    );
}

function FourColPage({ page, currency, comingSoon, t, pageNum, totalPages }) {
    return (
        <ContentPageShell page={page} currency={currency} comingSoon={comingSoon} t={t} pageNum={pageNum} totalPages={totalPages}>
            <FlatGrid
                blocks={page.blocks}
                gridClass="brochure-grid-4"
                cardVariant="compact"
                accent={page.accent}
                currency={currency}
                comingSoon={comingSoon}
                t={t}
            />
        </ContentPageShell>
    );
}

function ThreeColPage({ page, currency, comingSoon, t, pageNum, totalPages }) {
    return (
        <ContentPageShell page={page} currency={currency} comingSoon={comingSoon} t={t} pageNum={pageNum} totalPages={totalPages}>
            <FlatGrid
                blocks={page.blocks}
                gridClass="brochure-grid-3"
                cardVariant="large"
                accent={page.accent}
                currency={currency}
                comingSoon={comingSoon}
                t={t}
            />
        </ContentPageShell>
    );
}

function HeroLeftPage({ page, currency, comingSoon, t, isTopTier, pageNum, totalPages }) {
    const allProds = getAllProducts(page.blocks);
    const hero = allProds[0];
    const compact = allProds.slice(1, 5);
    const cats = isTopTier ? [] : getCategories(page.blocks);
    const accent = page.accent || 'blue';
    const label = isTopTier ? t('landing.brochureTopTierEyebrow') : null;

    return (
        <div className="brochure-page-inner" data-accent={accent}>
            <PageHeader categories={cats} accent={accent} label={label} t={t} />
            <div className="brochure-page-body">
                <div className="brochure-hero-left-body">
                    <div className="brochure-hero-panel" data-accent={accent}>
                        <div className="brochure-hero-panel-glow" aria-hidden />
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
                    <div className="brochure-compact-panel">
                        <div className="brochure-grid-2 brochure-grid-2--hero-side">
                            {compact.map((p) => (
                                <BrochureProductCard
                                    key={p.sku}
                                    product={p}
                                    currency={currency}
                                    comingSoon={comingSoon}
                                    variant="compact"
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            <PageFooter pageNum={pageNum} totalPages={totalPages} t={t} />
        </div>
    );
}

function ContactPage({ t, pageNum, totalPages }) {
    const storeLinks = [
        {
            key: 'official',
            href: LANDING_OFFICIAL_STORE_URL,
            label: t('landing.brochureContactOfficialStore'),
            sub: 'freemirofficial.com',
        },
        {
            key: 'shopee',
            href: LANDING_SHOPEE_STORE_URL,
            label: t('landing.brochureContactShopee'),
            sub: 'shopee.co.id/freemirofficial',
        },
        {
            key: 'maps',
            href: LANDING_CONTACT_MAPS_URL,
            label: t('landing.brochureContactMaps'),
            sub: t('landing.contactAddressLabel'),
        },
    ];

    const socialLabelKey = {
        instagram: 'landing.brochureContactInstagram',
        tiktok: 'landing.brochureContactTikTok',
    };

    return (
        <div className="brochure-page-inner" data-accent="blue">
            <PageHeader categories={[]} accent="blue" t={t} />
            <div className="brochure-page-body brochure-contact-body">
                <div className="brochure-contact-layout">
                    <aside className="brochure-contact-aside">
                        <p className="brochure-contact-eyebrow">{t('landing.brochureContactEyebrow')}</p>
                        <h2 className="brochure-contact-title">{t('landing.contactUsTitle')}</h2>
                        <p className="brochure-contact-lead">{t('landing.brochureContactLead')}</p>

                        <div className="brochure-contact-social-block">
                            <span className="brochure-contact-social-label">
                                {t('landing.brochureContactSocialTitle')}
                            </span>
                            <div className="brochure-contact-social-row">
                                {LANDING_BROCHURE_SOCIAL.map((social) => (
                                    <a
                                        key={social.id}
                                        href={social.href}
                                        className={`brochure-contact-social-pill brochure-contact-social-pill--${social.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        <span className="brochure-contact-social-icon" aria-hidden>
                                            <SocialIcon id={social.id} />
                                        </span>
                                        <span className="brochure-contact-social-copy">
                                            <span className="brochure-contact-social-name">
                                                {t(socialLabelKey[social.id])}
                                            </span>
                                            <span className="brochure-contact-social-handle">{social.handle}</span>
                                        </span>
                                    </a>
                                ))}
                            </div>
                        </div>

                        <p className="brochure-contact-mission">{t('landing.footerMission')}</p>
                    </aside>

                    <div className="brochure-contact-main">
                        <div className="brochure-contact-regions">
                            {LANDING_CONTACT_REGIONS.map((region) => (
                                <article key={region.id} className="brochure-contact-region">
                                    <header className="brochure-contact-region-head">
                                        <CountryFlag
                                            code={region.countryCode}
                                            alt=""
                                            className="brochure-contact-flag"
                                        />
                                        <h3>{t(region.countryKey)}</h3>
                                    </header>
                                    <div className="brochure-contact-channels">
                                        <a href={region.email.href} className="brochure-contact-link">
                                            <span className="brochure-contact-link-label">{t('landing.contactEmail')}</span>
                                            <span className="brochure-contact-link-value">{region.email.display}</span>
                                        </a>
                                        <a
                                            href={region.whatsapp.href}
                                            className="brochure-contact-link brochure-contact-link--whatsapp"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <span className="brochure-contact-link-label">{t('landing.contactWhatsApp')}</span>
                                            <span className="brochure-contact-link-value">{region.whatsapp.display}</span>
                                        </a>
                                    </div>
                                </article>
                            ))}
                        </div>

                        <article className="brochure-contact-stores">
                            <header className="brochure-contact-stores-head">
                                <h3>{t('landing.brochureContactLinksTitle')}</h3>
                            </header>
                            <div className="brochure-contact-store-grid">
                                {storeLinks.map((link) => (
                                    <a
                                        key={link.key}
                                        href={link.href}
                                        className="brochure-contact-store-card"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        <span className="brochure-contact-store-label">{link.label}</span>
                                        <span className="brochure-contact-store-url">{link.sub}</span>
                                    </a>
                                ))}
                            </div>
                        </article>

                        <div className="brochure-contact-meta">
                            <div className="brochure-contact-meta-block">
                                <span className="brochure-contact-meta-label">{t('landing.contactAddressLabel')}</span>
                                <p className="brochure-contact-meta-value">{t(LANDING_CONTACT_ADDRESS_KEY)}</p>
                            </div>
                            <div className="brochure-contact-meta-block">
                                <span className="brochure-contact-meta-label">{t('landing.contactHoursLabel')}</span>
                                <p className="brochure-contact-meta-value">{t('landing.contactHours')}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <PageFooter pageNum={pageNum} totalPages={totalPages} t={t} />
        </div>
    );
}

function CoverPage({ t }) {
    const year = new Date().getFullYear();
    return (
        <div className="brochure-cover">
            <div
                className="brochure-cover-image"
                style={{ backgroundImage: 'url(/Kitchen_BG.png)' }}
            >
                <span className="brochure-cover-image-overlay" aria-hidden />
            </div>
            <div className="brochure-cover-panel">
                <div className="brochure-cover-panel-inner">
                    <div className="brochure-cover-top">
                        <img src="/logo.png" alt="freemir" className="brochure-cover-logo" />
                        <span className="brochure-cover-edition">{t('landing.brochureCoverEdition', { year })}</span>
                    </div>
                    <div className="brochure-cover-copy">
                        <p className="brochure-cover-eyebrow">{t('landing.brochureCoverEyebrow')}</p>
                        <h1 className="brochure-cover-title">
                            <span className="brochure-cover-title-brand">freemir</span>
                            <span className="brochure-cover-title-line">{t('landing.brochureCoverTitleLine')}</span>
                        </h1>
                        <p className="brochure-cover-sub">{t('landing.brochureCoverSub')}</p>
                    </div>
                    <div className="brochure-cover-footer">
                        <span className="brochure-cover-tagline">{t('landing.brochureFooterTagline')}</span>
                        <span className="brochure-cover-confidential">{t('landing.brochureCoverConfidential')}</span>
                    </div>
                </div>
                <span className="brochure-cover-accent-line" aria-hidden />
            </div>
        </div>
    );
}

function BrochurePageContent({ page, currency, comingSoon, t, pageNum, totalPages }) {
    if (page.type === BROCHURE_PAGE_TYPES.COVER) {
        return <CoverPage t={t} />;
    }

    if (page.type === BROCHURE_PAGE_TYPES.CONTACT) {
        return (
            <ContactPage
                t={t}
                pageNum={pageNum}
                totalPages={totalPages}
            />
        );
    }

    if (page.type === BROCHURE_PAGE_TYPES.TOP_TIER) {
        return (
            <HeroLeftPage
                page={page}
                currency={currency}
                comingSoon={comingSoon}
                t={t}
                isTopTier
                pageNum={pageNum}
                totalPages={totalPages}
            />
        );
    }

    switch (page.layout) {
        case LAYOUT_TYPES.HERO_LEFT:
            return (
                <HeroLeftPage
                    page={page}
                    currency={currency}
                    comingSoon={comingSoon}
                    t={t}
                    pageNum={pageNum}
                    totalPages={totalPages}
                />
            );
        case LAYOUT_TYPES.FOUR_COL:
            return (
                <FourColPage
                    page={page}
                    currency={currency}
                    comingSoon={comingSoon}
                    t={t}
                    pageNum={pageNum}
                    totalPages={totalPages}
                />
            );
        case LAYOUT_TYPES.THREE_COL:
            return (
                <ThreeColPage
                    page={page}
                    currency={currency}
                    comingSoon={comingSoon}
                    t={t}
                    pageNum={pageNum}
                    totalPages={totalPages}
                />
            );
        default:
            return (
                <FiveColPage
                    page={page}
                    currency={currency}
                    comingSoon={comingSoon}
                    t={t}
                    pageNum={pageNum}
                    totalPages={totalPages}
                />
            );
    }
}

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
                                    pageNum={index + 1}
                                    totalPages={totalPages}
                                />
                            </section>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
