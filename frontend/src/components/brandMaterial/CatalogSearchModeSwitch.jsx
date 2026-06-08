import React from 'react';
import '../LanguageSwitch.css';

const MODES = [
    { value: 'product', labelKey: 'brandMaterial.catalogSearchModeProduct' },
    { value: 'detail', labelKey: 'brandMaterial.catalogSearchModeDetail' },
];

export default function CatalogSearchModeSwitch({ value, onChange, t }) {
    const activeIndex = Math.max(0, MODES.findIndex((opt) => opt.value === value));

    return (
        <div
            className="bm-catalog-search-mode-switch fm-pill-switch"
            role="group"
            aria-label={t('brandMaterial.catalogSearchModeLabel')}
        >
            <span
                className="fm-pill-switch-thumb bm-catalog-search-mode-thumb"
                style={{ '--mode-index': activeIndex }}
                aria-hidden
            />
            {MODES.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    className={`fm-pill-switch-btn${value === opt.value ? ' is-active' : ''}`}
                    aria-pressed={value === opt.value}
                    onClick={() => onChange(opt.value)}
                >
                    {t(opt.labelKey)}
                </button>
            ))}
        </div>
    );
}
