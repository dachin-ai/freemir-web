import React from 'react';
import { useLang } from '../context/LangContext';
import './LanguageSwitch.css';

const OPTIONS = [
    { value: 'en', label: 'EN' },
    { value: 'zh', label: '中文' },
    { value: 'id', label: 'ID' },
];

export default function LanguageSwitch({ className = '', compact = false }) {
    const { lang, setLanguage } = useLang();
    const activeIndex = Math.max(0, OPTIONS.findIndex((o) => o.value === lang));

    return (
        <div
            className={`fm-lang-switch fm-pill-switch${compact ? ' fm-pill-switch--compact' : ''} ${className}`.trim()}
            role="group"
            aria-label="Language"
        >
            <span
                className="fm-pill-switch-thumb fm-lang-switch-thumb"
                style={{ '--lang-index': activeIndex }}
            />
            {OPTIONS.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    className={`fm-pill-switch-btn fm-lang-switch-btn${lang === opt.value ? ' is-active' : ''}`}
                    onClick={() => setLanguage(opt.value)}
                    aria-pressed={lang === opt.value}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}
