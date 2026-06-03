import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowRightOutlined, SunOutlined, MoonOutlined, LoginOutlined,
    MailOutlined, EnvironmentOutlined, ClockCircleOutlined, ShopOutlined,
} from '@ant-design/icons';
import { Pagination, Spin } from 'antd';
import { useTheme } from '../context/ThemeContext';
import LanguageSwitch from '../components/LanguageSwitch';
import CountryFlag from '../components/CountryFlag';
import LandingCurrencySwitch from '../components/landing/LandingCurrencySwitch';
import LandingProductDetailModal from '../components/landing/LandingProductDetailModal';
import LandingSeriesPager from '../components/landing/LandingSeriesPager';
import {
    ProductImage,
    discountBadge,
    formatProductOriginalPrice,
    formatProductPrice,
    productHasStrikethroughOriginal,
    compareProductCatalogOrder,
} from '../components/landing/landingProductHelpers';
import { useLandingCurrency } from '../hooks/useLandingCurrency';
import { useLandingMediaProtection } from '../hooks/useLandingMediaProtection';
import { useSeriesRowPageSize } from '../hooks/useSeriesRowPageSize';
import api from '../api';
import SocialIcon, { SOCIAL_LINKS } from '../components/SocialIcon';
import {
    LANDING_CONTACT_ADDRESS_KEY,
    LANDING_CONTACT_MAPS_URL,
    LANDING_CONTACT_REGIONS,
    LANDING_OFFICIAL_STORE_URL,
    LANDING_SHOPEE_STORE_URL,
} from '../data/landingContact';
import {
    ABOUT_IMAGE_CANDIDATES,
    HERO_IMAGE_CANDIDATES,
    LANDING_STATS,
} from '../data/landingProducts';
import { getSeriesDisplayTitle, seriesNameToSlug } from '../data/landingSeriesLabels';
import './landing.css';

function WhatsAppIcon() {
    return (
        <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
    );
}

function prettyAdvantage(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    return raw
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

function FallbackImage({ candidates, className, alt = '' }) {
    const [index, setIndex] = useState(0);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setIndex(0);
        setFailed(false);
    }, [candidates]);

    const src = candidates[Math.min(index, candidates.length - 1)];

    if (failed || !src) {
        return <div className={`${className} landing-img-fallback`} aria-hidden />;
    }

    return (
        <img
            className={className}
            src={src}
            alt={alt}
            loading="lazy"
            onError={() => {
                if (index < candidates.length - 1) {
                    setIndex((i) => i + 1);
                } else {
                    setFailed(true);
                }
            }}
        />
    );
}

export default function LandingPage() {
    const { t, i18n } = useTranslation();
    const { isDark, toggleTheme } = useTheme();
    const [heroIndex, setHeroIndex] = useState(0);
    const [products, setProducts] = useState([]);
    const [topTierProducts, setTopTierProducts] = useState([]);
    const [seriesGroups, setSeriesGroups] = useState([]);
    const [categories, setCategories] = useState([]);
    const [activeCategory, setActiveCategory] = useState('');
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [catalogPage, setCatalogPage] = useState(1);
    const [seriesPageByKey, setSeriesPageByKey] = useState({});
    const [productsLoading, setProductsLoading] = useState(true);
    const [productsRefreshing, setProductsRefreshing] = useState(false);
    const catalogHydratedRef = useRef(false);
    const [currency, setCurrency] = useLandingCurrency();
    useLandingMediaProtection();
    const seriesRowPageSize = useSeriesRowPageSize();

    const scrollToSection = (id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const nav = document.querySelector('.landing-nav');
        const offset = (nav?.offsetHeight ?? 72) + 12;
        const top = el.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    };

    useEffect(() => {
        const hash = window.location.hash?.replace('#', '').trim();
        if (!hash || hash === 'top') return undefined;
        const timer = window.setTimeout(() => scrollToSection(hash), 100);
        return () => window.clearTimeout(timer);
    }, []);

    useEffect(() => {
        let cancelled = false;
        const scrollY = window.scrollY;
        if (!catalogHydratedRef.current) {
            setProductsLoading(true);
        } else {
            setProductsRefreshing(true);
        }

        const lang = (i18n.language || 'id').slice(0, 2).toLowerCase();
        api.get('/public/landing-products', { params: { currency, lang, scope: 'landing' }, timeout: 60000 })
            .then((res) => {
                if (!cancelled) {
                    const payload = res.data || {};
                    setProducts(payload.products || []);
                    setTopTierProducts(payload.top_tier_products || []);
                    setSeriesGroups(payload.series_groups || []);
                    const fetchedCategories = payload.categories || [];
                    setCategories(fetchedCategories);
                    setActiveCategory((prev) => (prev && fetchedCategories.includes(prev) ? prev : ''));
                    catalogHydratedRef.current = true;
                }
            })
            .catch(() => {
                if (!cancelled && !catalogHydratedRef.current) {
                    setProducts([]);
                    setTopTierProducts([]);
                    setSeriesGroups([]);
                    setCategories([]);
                    setActiveCategory('');
                    setCatalogPage(1);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setProductsLoading(false);
                    setProductsRefreshing(false);
                    requestAnimationFrame(() => {
                        window.scrollTo({ top: scrollY, left: 0 });
                    });
                }
            });
        return () => { cancelled = true; };
    }, [i18n.language, currency]);

    useEffect(() => {
        setSeriesPageByKey({});
    }, [currency, i18n.language, seriesRowPageSize]);

    const heroImage = HERO_IMAGE_CANDIDATES[Math.min(heroIndex, HERO_IMAGE_CANDIDATES.length - 1)];
    const filteredProducts = activeCategory
        ? products.filter((p) => p.category_l2 === activeCategory)
        : products;
    const sortedProducts = [...filteredProducts].sort(compareProductCatalogOrder);
    const PAGE_SIZE = 18; // 3 rows on desktop default grid
    const pagedProducts = sortedProducts.slice((catalogPage - 1) * PAGE_SIZE, catalogPage * PAGE_SIZE);
    const hasCatalogContent = products.length > 0
        || topTierProducts.length > 0
        || seriesGroups.length > 0;
    const catalogInitialLoading = productsLoading && !hasCatalogContent;
    const catalogRefreshClass = productsRefreshing ? ' landing-section-refreshing' : '';

    const topRow = topTierProducts.filter((_, idx) => idx % 2 === 0);
    const bottomRow = topTierProducts.filter((_, idx) => idx % 2 === 1);
    const comingSoon = t('landing.comingSoon');
    const renderProductCard = (p, cardIndex = null) => (
        <button
            type="button"
            key={p.sku}
            className="landing-product-card landing-product-card-static landing-product-button"
            style={cardIndex == null ? undefined : { '--card-index': cardIndex }}
            onClick={() => setSelectedProduct(p)}
        >
            <ProductImage src={p.image_url} alt={p.name} />
            <div className="meta">
                <div className="sku">{p.sku}</div>
                <div className={`landing-price${!p.has_price ? ' is-coming-soon' : ''}`}>
                    {formatProductPrice(p, currency, comingSoon)}
                </div>
                {productHasStrikethroughOriginal(p) && (
                    <div className="landing-price-was-row">
                        {p.has_price && !!Number(p.discount_percent || 0) && (
                            <span className="landing-discount-badge">-{p.discount_percent}%</span>
                        )}
                        <div className="landing-price-was">
                            {formatProductOriginalPrice(p, currency)}
                        </div>
                    </div>
                )}
                <div className="name">{p.name}</div>
            </div>
        </button>
    );

    const renderMarqueeRow = (items, className) => {
        if (!items.length) return null;
        const duplicated = [...items, ...items];
        return (
            <div className={`landing-marquee ${className}`}>
                <div className="landing-marquee-track">
                    {duplicated.map((p, idx) => (
                        <button
                            type="button"
                            key={`${className}-${p.sku}-${idx}`}
                            className="landing-top-tier-card"
                            onClick={() => setSelectedProduct(p)}
                        >
                            <ProductImage src={p.image_url} alt={p.name} eager />
                            <div className="meta">
                                <div className="sku">{p.sku}</div>
                                <div className="name">{p.name}</div>
                                <ul className="landing-top-tier-adv-list">
                                    {(p.detail?.advantages || []).slice(0, 5).map((adv) => (
                                        <li key={`${p.sku}-${adv}`}>{prettyAdvantage(adv)}</li>
                                    ))}
                                </ul>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="landing-root" data-theme={isDark ? 'dark' : 'light'}>
            <header className="landing-nav">
                <a href="#top" className="landing-brand" onClick={(e) => { e.preventDefault(); scrollToSection('top'); }}>
                    <img src="/logo.png" alt="freemir" />
                </a>

                <nav className="landing-nav-links" aria-label="Primary">
                    <a href="#about" onClick={(e) => { e.preventDefault(); scrollToSection('about'); }}>{t('landing.navAbout')}</a>
                    <a href="#catalog" onClick={(e) => { e.preventDefault(); scrollToSection('catalog'); }}>{t('landing.navProducts')}</a>
                    <a href="#learn" onClick={(e) => { e.preventDefault(); scrollToSection('learn'); }}>{t('landing.navLearn')}</a>
                    <a href="#contact" onClick={(e) => { e.preventDefault(); scrollToSection('contact'); }}>{t('landing.navContact')}</a>
                    <a
                        href={LANDING_OFFICIAL_STORE_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {t('landing.navShop')}
                    </a>
                    <a
                        href={LANDING_SHOPEE_STORE_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {t('landing.navShopee')}
                    </a>
                </nav>

                <div className="landing-nav-actions">
                    {productsRefreshing && (
                        <Spin size="small" className="landing-nav-refresh-spin" aria-hidden />
                    )}
                    <LandingCurrencySwitch currency={currency} onChange={setCurrency} />
                    <LanguageSwitch />
                    <button type="button" className="landing-btn-ghost" onClick={toggleTheme} aria-label="Toggle theme">
                        {isDark ? <SunOutlined /> : <MoonOutlined />}
                    </button>
                    <Link to="/login" className="landing-btn landing-btn-team">
                        <LoginOutlined />
                        <span className="landing-btn-team-label">{t('landing.navTeamLogin')}</span>
                    </Link>
                </div>
            </header>

            <section
                id="top"
                className="landing-hero"
                style={{ backgroundImage: heroImage ? `url(${heroImage})` : undefined }}
            >
                <img
                    className="landing-hero-preload"
                    src={heroImage}
                    alt=""
                    aria-hidden
                    onError={() => {
                        if (heroIndex < HERO_IMAGE_CANDIDATES.length - 1) {
                            setHeroIndex((i) => i + 1);
                        }
                    }}
                />
                <div className="landing-hero-overlay" />
                <div className="landing-hero-content">
                    <h1>{t('landing.heroTitle')}</h1>
                    <div className="landing-hero-actions">
                        <a
                            href={LANDING_OFFICIAL_STORE_URL}
                            className="landing-btn landing-btn-primary landing-btn-hero"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <ShopOutlined />
                            {t('landing.shopNow')}
                            <ArrowRightOutlined />
                        </a>
                        <a
                            href={LANDING_SHOPEE_STORE_URL}
                            className="landing-btn landing-btn-shopee landing-btn-hero"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <ShopOutlined />
                            {t('landing.shopOnShopee')}
                            <ArrowRightOutlined />
                        </a>
                    </div>
                </div>
            </section>

            <section className="landing-section" id="about">
                <div className="landing-about-grid">
                    <div>
                        <h2 className="landing-section-title">
                            freemir — <span className="accent">{t('landing.aboutAccent')}</span>
                        </h2>
                        <p className="landing-section-lead">{t('landing.aboutP1')}</p>
                        <p className="landing-section-lead" style={{ marginBottom: 0 }}>{t('landing.aboutP2')}</p>
                    </div>
                    <FallbackImage
                        candidates={ABOUT_IMAGE_CANDIDATES}
                        className="landing-about-img"
                    />
                </div>
            </section>

            <section className="landing-section" id="top-tier">
                <h2 className="landing-section-title">{t('landing.topTierTitle')}</h2>
                <p className="landing-section-lead">{t('landing.topTierLead')}</p>
                {catalogInitialLoading ? (
                    <div className="landing-products-loading">
                        <Spin />
                    </div>
                ) : (
                    <div className={`landing-top-tier-wrap${catalogRefreshClass}`}>
                        {renderMarqueeRow(topRow, 'left')}
                        {renderMarqueeRow(bottomRow, 'right')}
                    </div>
                )}
                {!catalogInitialLoading && topTierProducts.length === 0 && (
                    <p className="landing-section-lead">{t('landing.catalogEmpty')}</p>
                )}
            </section>

            {hasCatalogContent && seriesGroups.length > 0 && (
                <section className={`landing-section landing-section-soft${catalogRefreshClass}`} id="series">
                    <h2 className="landing-section-title">{t('landing.seriesTitle')}</h2>
                    <p className="landing-section-lead">{t('landing.seriesLead')}</p>
                    <div className="landing-series-stack">
                        {seriesGroups.map((group) => {
                            const seriesKey = seriesNameToSlug(group.name) || group.name;
                            const totalInSeries = group.products?.length || 0;
                            const totalPages = Math.max(1, Math.ceil(totalInSeries / seriesRowPageSize));
                            const currentPage = Math.min(
                                seriesPageByKey[seriesKey] || 1,
                                totalPages,
                            );
                            return (
                                <article className="landing-series-block" key={seriesKey}>
                                    <header className="landing-series-block-head">
                                        <h3 className="landing-series-block-title">
                                            {getSeriesDisplayTitle(group.name, t)}
                                        </h3>
                                        <p className="landing-series-block-count">
                                            {t('landing.seriesProductCount', { count: group.count })}
                                        </p>
                                    </header>
                                    <LandingSeriesPager
                                        products={group.products || []}
                                        pageSize={seriesRowPageSize}
                                        currentPage={currentPage}
                                        onPageChange={(page) => {
                                            setSeriesPageByKey((prev) => ({
                                                ...prev,
                                                [seriesKey]: page,
                                            }));
                                        }}
                                        renderProductCard={renderProductCard}
                                    />
                                </article>
                            );
                        })}
                    </div>
                </section>
            )}

            <section className="landing-section" id="catalog">
                <h2 className="landing-section-title">{t('landing.catalogTitle')}</h2>
                <p className="landing-section-lead">{t('landing.catalogLeadDb')}</p>
                {!catalogInitialLoading && categories.length > 0 && (
                    <div className="landing-filter-row">
                        <button
                            type="button"
                            className={`landing-filter-chip ${activeCategory === '' ? 'active' : ''}`}
                            onClick={() => {
                                setActiveCategory('');
                                setCatalogPage(1);
                            }}
                        >
                            {t('landing.allCategories')}
                        </button>
                        {categories.map((cat) => (
                            <button
                                type="button"
                                key={cat}
                                className={`landing-filter-chip ${activeCategory === cat ? 'active' : ''}`}
                                onClick={() => {
                                    setActiveCategory(cat);
                                    setCatalogPage(1);
                                }}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                )}
                {catalogInitialLoading ? (
                    <div className="landing-products-loading">
                        <Spin />
                    </div>
                ) : (
                    <div className="landing-catalog-viewport">
                        <div
                            key={`${activeCategory}-${catalogPage}`}
                            className={`landing-product-row landing-catalog-grid${catalogRefreshClass}`}
                        >
                            {pagedProducts.map((p, index) => renderProductCard(p, index))}
                        </div>
                    </div>
                )}
                {!catalogInitialLoading && sortedProducts.length === 0 && (
                    <p className="landing-section-lead">{t('landing.catalogEmpty')}</p>
                )}
                {!catalogInitialLoading && sortedProducts.length > PAGE_SIZE && (
                    <div className="landing-catalog-pagination">
                        <Pagination
                            current={catalogPage}
                            pageSize={PAGE_SIZE}
                            total={sortedProducts.length}
                            onChange={(page) => setCatalogPage(page)}
                            showSizeChanger={false}
                        />
                    </div>
                )}
            </section>

            <section className="landing-section">
                <h2 className="landing-section-title">{t('landing.statsTitle')}</h2>
                <div className="landing-stats">
                    {LANDING_STATS.map((stat) => (
                        <div key={stat.id} className="landing-stat">
                            <strong>{stat.value}</strong>
                            <span>{t(`landing.stats.${stat.id}`)}</span>
                        </div>
                    ))}
                </div>
            </section>

            <section className="landing-section" id="learn">
                <h2 className="landing-section-title">{t('landing.learnTitle')}</h2>
                <p className="landing-section-lead">{t('landing.learnLead')}</p>
                <div className="landing-tools-grid">
                    <div className="landing-tool-card">
                        <h3>{t('landing.learnProductTitle')}</h3>
                        <p>{t('landing.learnProductDesc')}</p>
                        <Link to="/learn-products" className="landing-btn landing-btn-outline">
                            {t('landing.learnProductTitle')}
                        </Link>
                    </div>
                    <div className="landing-tool-card">
                        <h3>{t('landing.compareTitle')}</h3>
                        <p>{t('landing.compareDesc')}</p>
                        <Link to="/compare-products" className="landing-btn landing-btn-outline">
                            {t('landing.compareTitle')}
                        </Link>
                    </div>
                </div>
            </section>

            <section className="landing-section landing-section-alt" id="contact">
                <h2 className="landing-section-title">{t('landing.contactUsTitle')}</h2>
                <div className="landing-contact-panel">
                    <div className="landing-contact-regions">
                        {LANDING_CONTACT_REGIONS.map((region) => (
                            <article className="landing-contact-region" key={region.id}>
                                <header className="landing-contact-region-head">
                                    <CountryFlag
                                        code={region.countryCode}
                                        alt=""
                                        aria-hidden
                                        className="landing-contact-region-flag"
                                    />
                                    <h3 className="landing-contact-region-name">
                                        {t(region.countryKey)}
                                    </h3>
                                </header>
                                <div className="landing-contact-channels">
                                    <a href={region.email.href} className="landing-contact-channel">
                                        <span className="landing-contact-channel-icon" aria-hidden>
                                            <MailOutlined />
                                        </span>
                                        <span className="landing-contact-channel-text">
                                            {region.email.display}
                                        </span>
                                    </a>
                                    <a
                                        href={region.whatsapp.href}
                                        className="landing-contact-channel"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        <span className="landing-contact-channel-icon" aria-hidden>
                                            <WhatsAppIcon />
                                        </span>
                                        <span className="landing-contact-channel-text">
                                            {region.whatsapp.display}
                                        </span>
                                    </a>
                                </div>
                            </article>
                        ))}
                    </div>
                    <div className="landing-contact-meta">
                        <a
                            href={LANDING_CONTACT_MAPS_URL}
                            className="landing-contact-channel landing-contact-channel-address"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <span className="landing-contact-channel-icon" aria-hidden>
                                <EnvironmentOutlined />
                            </span>
                            <span className="landing-contact-channel-text">
                                {t(LANDING_CONTACT_ADDRESS_KEY)}
                            </span>
                        </a>
                        <div className="landing-contact-hours">
                            <span className="landing-contact-channel-icon" aria-hidden>
                                <ClockCircleOutlined />
                            </span>
                            <span className="landing-contact-channel-text landing-contact-hours-text">
                                <strong>{t('landing.contactHoursLabel')}:</strong>{' '}
                                {t('landing.contactHours')}
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            <footer className="landing-footer">
                <img src="/logo.png" alt="freemir" />
                <p>{t('landing.footerMission')}</p>
                <div className="landing-footer-actions">
                    <a
                        href={LANDING_OFFICIAL_STORE_URL}
                        className="landing-btn landing-btn-primary"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <ShopOutlined />
                        {t('landing.shopNow')}
                        <ArrowRightOutlined />
                    </a>
                    <a
                        href={LANDING_SHOPEE_STORE_URL}
                        className="landing-btn landing-btn-shopee"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <ShopOutlined />
                        {t('landing.shopOnShopee')}
                        <ArrowRightOutlined />
                    </a>
                    <Link to="/login" className="landing-btn landing-btn-outline">
                        {t('landing.teamAccess')}
                        <ArrowRightOutlined />
                    </Link>
                </div>
                <div className="landing-social">
                    <p className="landing-social-title">{t('landing.followUsTitle')}</p>
                    <div className="landing-social-row">
                        {SOCIAL_LINKS.map((link) => (
                            <a
                                key={link.id}
                                href={link.href}
                                className="landing-social-btn"
                                data-social={link.id}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={link.label}
                            >
                                <SocialIcon id={link.id} />
                            </a>
                        ))}
                    </div>
                </div>
                <p className="landing-footer-copy">
                    <small>{t('landing.footerCopyright', { year: new Date().getFullYear() })}</small>
                </p>
            </footer>
            <LandingProductDetailModal
                product={selectedProduct}
                onClose={() => setSelectedProduct(null)}
                currency={currency}
            />
        </div>
    );
}
