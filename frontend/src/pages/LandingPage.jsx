import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowRightOutlined, SunOutlined, MoonOutlined, LoginOutlined, PictureOutlined,
    MailOutlined, EnvironmentOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import { Spin } from 'antd';
import { useTheme } from '../context/ThemeContext';
import LanguageSwitch from '../components/LanguageSwitch';
import CountryFlag from '../components/CountryFlag';
import api from '../api';
import LandingCategoryIcon from '../components/LandingCategoryIcon';
import SocialIcon, { SOCIAL_LINKS } from '../components/SocialIcon';
import {
    LANDING_CONTACT_ADDRESS_KEY,
    LANDING_CONTACT_MAPS_URL,
    LANDING_CONTACT_REGIONS,
} from '../data/landingContact';
import {
    ABOUT_IMAGE_CANDIDATES,
    HERO_IMAGE_CANDIDATES,
    LANDING_CATEGORIES,
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

function ProductImage({ src, alt }) {
    const [failed, setFailed] = useState(!src);
    useEffect(() => {
        setFailed(!src);
    }, [src]);
    if (failed || !src) {
        return (
            <div className="landing-product-placeholder" aria-hidden>
                <PictureOutlined />
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
    const { t } = useTranslation();
    const { isDark, toggleTheme } = useTheme();
    const [heroIndex, setHeroIndex] = useState(0);
    const [products, setProducts] = useState([]);
    const [productsLoading, setProductsLoading] = useState(true);

    const scrollTo = (id) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    useEffect(() => {
        let cancelled = false;
        setProductsLoading(true);
        api.get('/public/landing-products', { params: { currency: 'IDR' }, timeout: 60000 })
            .then((res) => {
                if (!cancelled) setProducts(res.data?.products || []);
            })
            .catch(() => {
                if (!cancelled) setProducts([]);
            })
            .finally(() => {
                if (!cancelled) setProductsLoading(false);
            });
        return () => { cancelled = true; };
    }, []);

    const heroImage = HERO_IMAGE_CANDIDATES[Math.min(heroIndex, HERO_IMAGE_CANDIDATES.length - 1)];

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

            <section className="landing-section landing-section-alt" id="catalog">
                <h2 className="landing-section-title">{t('landing.catalogTitle')}</h2>
                <p className="landing-section-lead">{t('landing.catalogLeadDb')}</p>
                {productsLoading ? (
                    <div className="landing-products-loading">
                        <Spin />
                    </div>
                ) : (
                    <div className="landing-product-row">
                        {products.map((p) => (
                            <article key={p.sku} className="landing-product-card landing-product-card-static">
                                <ProductImage src={p.image_url} alt={p.name} />
                                <div className="meta">
                                    <div className="sku">{p.sku}</div>
                                    <div className="landing-price">{formatIdr(p.sale_price)}</div>
                                    {p.original_price != null && (
                                        <div className="landing-price-was">{formatIdr(p.original_price)}</div>
                                    )}
                                    <div className="name">{p.name}</div>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
                {!productsLoading && products.length === 0 && (
                    <p className="landing-section-lead">{t('landing.catalogEmpty')}</p>
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

            <section className="landing-section landing-section-alt">
                <h2 className="landing-section-title">{t('landing.categoriesTitle')}</h2>
                <p className="landing-section-lead">{t('landing.categoriesLead')}</p>
                <div className="landing-cat-grid">
                    {LANDING_CATEGORIES.map((cat) => (
                        <a
                            key={cat.id}
                            href="#catalog"
                            className="landing-cat-item"
                            onClick={(e) => { e.preventDefault(); scrollTo('catalog'); }}
                        >
                            <div className="landing-cat-icon">
                                <LandingCategoryIcon id={cat.id} />
                            </div>
                            <span>{t(`landing.categories.${cat.id}`)}</span>
                        </a>
                    ))}
                </div>
            </section>

            <section className="landing-section" id="learn">
                <h2 className="landing-section-title">{t('landing.learnTitle')}</h2>
                <p className="landing-section-lead">{t('landing.learnLead')}</p>
                <div className="landing-tools-grid">
                    <div className="landing-tool-card">
                        <h3>{t('landing.compareTitle')}</h3>
                        <p>{t('landing.compareDesc')}</p>
                        <span className="landing-btn landing-btn-outline">{t('landing.comingSoon')}</span>
                    </div>
                    <div className="landing-tool-card">
                        <h3>{t('landing.learnProductTitle')}</h3>
                        <p>{t('landing.learnProductDesc')}</p>
                        <span className="landing-btn landing-btn-outline">{t('landing.comingSoon')}</span>
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
        </div>
    );
}
