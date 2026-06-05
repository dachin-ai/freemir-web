import React from 'react';

/**
 * Sliding pill toggle — Freemir blue active state.
 * @param {{ key: string, label: React.ReactNode, icon?: React.ComponentType }[]} options
 */
export default function SmaSlideToggle({
    options,
    value,
    onChange,
    className = '',
}) {
    const cols = options.length || 1;
    const idx = Math.max(0, options.findIndex((o) => o.key === value));

    return (
        <div
            className={`sma-slide-toggle sma-slide-toggle--${cols} ${className}`.trim()}
            role="tablist"
        >
            <div
                className="sma-slide-toggle-slider"
                style={{ transform: `translateX(${idx * 100}%)` }}
                aria-hidden
            />
            {options.map((opt) => {
                const Icon = opt.icon;
                const active = opt.key === value;
                return (
                    <button
                        key={opt.key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={`sma-slide-toggle-btn${active ? ' sma-slide-toggle-btn--active' : ''}`}
                        onClick={() => onChange(opt.key)}
                    >
                        {Icon ? <Icon className="sma-slide-toggle-icon" /> : null}
                        <span>{opt.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
