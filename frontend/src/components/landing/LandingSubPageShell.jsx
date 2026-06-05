import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import LanguageSwitch from '../LanguageSwitch';
import LandingAuthNav from './LandingAuthNav';
import LandingCurrencySwitch from './LandingCurrencySwitch';
import { useLandingMediaProtection } from '../../hooks/useLandingMediaProtection';

export default function LandingSubPageShell({ title, lead, children, currency, onCurrencyChange }) {
    const { t } = useTranslation();
    const { isDark, toggleTheme } = useTheme();
    useLandingMediaProtection();

    return (
        <div className="landing-root landing-sub-root" data-theme={isDark ? 'dark' : 'light'}>
            <header className="landing-sub-header">
                <Link to="/" className="landing-sub-back">
                    <ArrowLeftOutlined />
                    {t('landing.backToHome')}
                </Link>
                <div className="landing-sub-header-actions">
                    {onCurrencyChange && (
                        <LandingCurrencySwitch currency={currency} onChange={onCurrencyChange} />
                    )}
                    <LanguageSwitch />
                    <button type="button" className="landing-btn-ghost" onClick={toggleTheme} aria-label="Toggle theme">
                        {isDark ? <SunOutlined /> : <MoonOutlined />}
                    </button>
                    <LandingAuthNav />
                </div>
            </header>
            <main className="landing-sub-main">
                <section className="landing-section landing-sub-section">
                    <h1 className="landing-section-title">{title}</h1>
                    {lead && <p className="landing-section-lead">{lead}</p>}
                    {children}
                </section>
            </main>
        </div>
    );
}
