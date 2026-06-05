import React from 'react';
import '../LanguageSwitch.css';

const OPTIONS = [
    { value: 'all', labelKey: 'brandMaterial.filterAll' },
    { value: 'photo', labelKey: 'brandMaterial.typePhoto' },
    { value: 'video', labelKey: 'brandMaterial.typeVideo' },
];

export default function MaterialTypeSwitch({ value, onChange, t }) {
    const activeIndex = Math.max(0, OPTIONS.findIndex((opt) => opt.value === value));

    return (
        <div className="fm-material-type-switch fm-pill-switch" role="group" aria-label={t('brandMaterial.filterType')}>
            <span
                className="fm-pill-switch-thumb fm-material-type-switch-thumb"
                style={{ '--type-index': activeIndex }}
                aria-hidden
            />
            {OPTIONS.map((opt) => (
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
