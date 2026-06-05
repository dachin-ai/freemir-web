import React from 'react';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import './LanguageSwitch.css';

export default function ThemeModeSwitch({ isDark, onChange, className = '', compact = false }) {
    const { t } = useTranslation();

    return (
        <div
            className={`fm-theme-switch fm-pill-switch${compact ? ' fm-pill-switch--compact' : ''}${className ? ` ${className}` : ''}`}
            role="group"
            aria-label={t('layout.themeModeLight')}
        >
            <span
                className="fm-pill-switch-thumb"
                style={{ transform: isDark ? 'translateX(calc(100% + 3px))' : 'translateX(0)' }}
                aria-hidden
            />
            <button
                type="button"
                className={`fm-pill-switch-btn${!isDark ? ' is-active' : ''}`}
                aria-pressed={!isDark}
                aria-label={t('layout.themeModeLight')}
                onClick={() => onChange(false)}
            >
                <SunOutlined />
            </button>
            <button
                type="button"
                className={`fm-pill-switch-btn${isDark ? ' is-active' : ''}`}
                aria-pressed={isDark}
                aria-label={t('layout.themeModeDark')}
                onClick={() => onChange(true)}
            >
                <MoonOutlined />
            </button>
        </div>
    );
}
