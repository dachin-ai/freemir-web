import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowRightOutlined, SunOutlined, MoonOutlined, LoginOutlined, PictureOutlined,
    MailOutlined, EnvironmentOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import { Modal, Pagination, Spin } from 'antd';
import { useTheme } from '../context/ThemeContext';
import LanguageSwitch from '../components/LanguageSwitch';
import CountryFlag from '../components/CountryFlag';
import api from '../api';
import SocialIcon, { SOCIAL_LINKS } from '../components/SocialIcon';
import {
    LANDING_CONTACT_ADDRESS_KEY,
    LANDING_CONTACT_MAPS_URL,
    LANDING_CONTACT_REGIONS,
} from '../data/landingContact';
import {
    ABOUT_IMAGE_CANDIDATES,
    HERO_IMAGE_CANDIDATES,
    LANDING_STATS,
} from '../data/landingProducts';
import './landing.css';

function WhatsAppIcon() {
    return (
        <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
    );
}

function formatIdr(price) {
    if (price === null || price === undefined) return '—';
    const n = Number(price);
    if (!Number.isFinite(n)) return '—';
    return `Rp ${n.toLocaleString('id-ID')}`;
}

function discountBadge(product) {
    const pct = Number(product?.discount_percent || 0);
    if (!pct || pct <= 0) return null;
    return <span className="landing-discount-badge">-{pct}%</span>;
}

function normalizeInline(text) {
    return String(text || '').replace(/\s*\n+\s*/g, ' x ').replace(/\s{2,}/g, ' ').trim();
}

function prettyAdvantage(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    return raw
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

function compareSkuAsc(a, b) {
    const sa = String(a?.sku || '').toUpperCase();
    const sb = String(b?.sku || '').toUpperCase();
    return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
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

function ProductImage({ src, alt, placeholderText = '' }) {
    const [failed, setFailed] = useState(!src);
    useEffect(() => {
        setFailed(!src);
    }, [src]);
    if (failed || !src) {
        return (
            <div className="landing-product-placeholder">
                <PictureOutlined />
                {placeholderText && <span className="landing-product-placeholder-text">{placeholderText}</span>}
            </div>
        );
    }
    return (
        <img
            src={src}
            alt={alt}
            loading="lazy"
            onError={() => setFailed(true)}
        />
    );
}

export default function LandingPage() {
    const { t, i18n } = useTranslation();
    const { isDark, toggleTheme } = useTheme();
    const [heroIndex, setHeroIndex] = useState(0);
    const [products, setProducts] = useState([]);
    const [topTierProducts, setTopTierProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [activeCategory, setActiveCategory] = useState('');
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [catalogPage, setCatalogPage] = useState(1);
    const [productsLoading, setProductsLoading] = useState(true);

    const scrollTo = (id) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    useEffect(() => {
        let cancelled = false;
        setProductsLoading(true);
        const lang = (i18n.language || 'id').slice(0, 2).toLowerCase();
        api.get('/public/landing-products', { params: { currency: 'IDR', lang }, timeout: 60000 })
            .then((res) => {
                if (!cancelled) {
                    const payload = res.data || {};
                    setProducts(payload.products || []);
                    setTopTierProducts(payload.top_tier_products || []);
                    const fetchedCategories = payload.categories || [];
                    setCategories(fetchedCategories);
                    setActiveCategory((prev) => (prev && fetchedCategories.includes(prev) ? prev : ''));
                    setCatalogPage(1);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setProducts([]);
                    setTopTierProducts([]);
                    setCategories([]);
                    setActiveCategory('');
                    setCatalogPage(1);
                }
            })
            .finally(() => {
                if (!cancelled) setProductsLoading(false);
            });
        return () => { cancelled = true; };
    }, [i18n.language]);

    const heroImage = HERO_IMAGE_CANDIDATES[Math.min(heroIndex, HERO_IMAGE_CANDIDATES.length - 1)];
    const filteredProducts = activeCategory
        ? products.filter((p) => p.category_l2 === activeCategory)
        : products;
    const sortedProducts = [...filteredProducts].sort(compareSkuAsc);
    const PAGE_SIZE = 18; // 3 rows on desktop default grid
    const pagedProducts = sortedProducts.slice((catalogPage - 1) * PAGE_SIZE, catalogPage * PAGE_SIZE);
    const topRow = topTierProducts.filter((_, idx) => idx % 2 === 0);
    const bottomRow = topTierProducts.filter((_, idx) => idx % 2 === 1);
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
                            <ProductImage src={p.image_url} alt={p.name} />
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
                <a href="#top" className="landing-brand" onClick={(e) => { e.preventDefault(); scrollTo('top'); }}>
                    <img src="/logo.png" alt="freemir" />
                </a>

                <nav className="landing-nav-links" aria-label="Primary">
                    <a href="#about" onClick={(e) => { e.preventDefault(); scrollTo('about'); }}>{t('landing.navAbout')}</a>
                    <a href="#catalog" onClick={(e) => { e.preventDefault(); scrollTo('catalog'); }}>{t('landing.navProducts')}</a>
                    <a href="#learn" onClick={(e) => { e.preventDefault(); scrollTo('learn'); }}>{t('landing.navLearn')}</a>
                    <a href="#contact" onClick={(e) => { e.preventDefault(); scrollTo('contact'); }}>{t('landing.navContact')}</a>
                </nav>

                <div className="landing-nav-actions">
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
                    <span className="landing-hero-tag">{t('landing.heroTag')}</span>
                    <h1>{t('landing.heroTitle')}</h1>
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

            <section className="landing-section" id="catalog">
                <h2 className="landing-section-title">{t('landing.topTierTitle')}</h2>
                <p className="landing-section-lead">{t('landing.topTierLead')}</p>
                {productsLoading ? (
                    <div className="landing-products-loading">
                        <Spin />
                    </div>
                ) : (
                    <div className="landing-top-tier-wrap">
                        {renderMarqueeRow(topRow, 'left')}
                        {renderMarqueeRow(bottomRow, 'right')}
                    </div>
                )}
                {!productsLoading && topTierProducts.length === 0 && (
                    <p className="landing-section-lead">{t('landing.catalogEmpty')}</p>
                )}
            </section>

            <section className="landing-section" id="catalog-list">
                <h2 className="landing-section-title">{t('landing.catalogTitle')}</h2>
                <p className="landing-section-lead">{t('landing.catalogLeadDb')}</p>
                {!productsLoading && categories.length > 0 && (
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
                {productsLoading ? (
                    <div className="landing-products-loading">
                        <Spin />
                    </div>
                ) : (
                    <div className="landing-product-row">
                        {pagedProducts.map((p) => (
                            <button
                                type="button"
                                key={p.sku}
                                className="landing-product-card landing-product-card-static landing-product-button"
                                onClick={() => setSelectedProduct(p)}
                            >
                                <ProductImage src={p.image_url} alt={p.name} />
                                <div className="meta">
                                    <div className="sku">{p.sku}</div>
                                    <div className="landing-price">{formatIdr(p.sale_price)}</div>
                                    {p.original_price != null && (
                                        <div className="landing-price-was-row">
                                            {!!Number(p.discount_percent || 0) && (
                                                <span className="landing-discount-badge">-{p.discount_percent}%</span>
                                            )}
                                            <div className="landing-price-was">{formatIdr(p.original_price)}</div>
                                        </div>
                                    )}
                                    <div className="name">{p.name}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
                {!productsLoading && sortedProducts.length === 0 && (
                    <p className="landing-section-lead">{t('landing.catalogEmpty')}</p>
                )}
                {!productsLoading && sortedProducts.length > PAGE_SIZE && (
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
                <Link to="/login" className="landing-btn landing-btn-primary">
                    {t('landing.teamAccess')}
                    <ArrowRightOutlined />
                </Link>
                <div className="landing-social">
                    <p className="landing-social-title">{t('landing.followUsTitle')}</p>
                    <div className="landing-social-row">
                        {SOCIAL_LINKS.map((link) => (
                            <a
                                key={link.id}
                                href={link.href}
                                className="landing-social-btn"
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
            <Modal
                open={!!selectedProduct}
                title={selectedProduct?.name || ''}
                onCancel={() => setSelectedProduct(null)}
                footer={null}
                width={760}
                className="landing-product-modal"
                maskStyle={{ backgroundColor: 'rgba(2, 6, 23, 0.9)' }}
            >
                {selectedProduct && (
                    <div className="landing-product-modal-content">
                        <div className="landing-product-modal-media">
                            <ProductImage src={selectedProduct.image_url} alt={selectedProduct.name} />
                        </div>
                        <div className="landing-product-modal-info">
                            <div className="landing-modal-sku">{selectedProduct.sku}</div>
                            <div className="landing-modal-price-line">
                                <div className="landing-modal-price">{formatIdr(selectedProduct.sale_price)}</div>
                                {discountBadge(selectedProduct)}
                            </div>
                            <div className="landing-modal-price-original">
                                <strong>{t('landing.modal.originalPrice')}:</strong>{' '}
                                {selectedProduct.original_price != null ? formatIdr(selectedProduct.original_price) : '—'}
                            </div>
                            <div className="landing-modal-price-original">
                                <strong>{t('landing.modal.discountPrice')}:</strong> {formatIdr(selectedProduct.sale_price)}
                            </div>
                            <div className="landing-modal-stock">
                                <strong>{t('landing.stockLabel')}:</strong> {selectedProduct.stock_summary || '—'}
                            </div>
                            <div className="landing-modal-grid">
                                <div><strong>{t('landing.modal.category')}:</strong> {selectedProduct.category_l1 || '—'}</div>
                                <div><strong>{t('landing.modal.subCategory')}:</strong> {selectedProduct.category_l2 || '—'}</div>
                                <div><strong>{t('landing.modal.color')}:</strong> {selectedProduct.detail?.color || '—'}</div>
                                <div><strong>{t('landing.modal.mainMaterial')}:</strong> {selectedProduct.detail?.main_material || '—'}</div>
                                <div><strong>{t('landing.modal.detailMaterial')}:</strong> {selectedProduct.detail?.detail_material || '—'}</div>
                                <div className="landing-modal-grid-span">
                                    <strong>{t('landing.modal.dimensions')}:</strong>{' '}
                                    {normalizeInline(selectedProduct.detail?.product_dimension_cm) || '—'}
                                </div>
                                <div><strong>{t('landing.modal.weight')}:</strong> {selectedProduct.detail?.nett_weight_g || '—'}</div>
                            </div>
                            <div className="landing-modal-adv-table-wrap">
                                <div className="landing-modal-adv-title">{t('landing.modal.advTableTitle')}</div>
                                <table className="landing-modal-adv-table">
                                    <thead>
                                        <tr>
                                            <th>{t('landing.modal.advantages')}</th>
                                            <th>{t('landing.modal.detailAdvantages')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Array.from({
                                            length: Math.max(
                                                (selectedProduct.detail?.advantages || []).length,
                                                (selectedProduct.detail?.detail_advantages || []).length,
                                                1,
                                            ),
                                        }).map((_, idx) => (
                                            <tr key={`adv-row-${idx}`}>
                                                <td>{selectedProduct.detail?.advantages?.[idx] || '-'}</td>
                                                <td>{selectedProduct.detail?.detail_advantages?.[idx] || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
