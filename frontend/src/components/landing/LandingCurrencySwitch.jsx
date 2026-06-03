import React from 'react';
import { SUPPORTED_CURRENCIES } from '../../utils/currencyStorage';

export default function LandingCurrencySwitch({ currency, onChange, className = '' }) {
    return (
        <div
            className={`landing-currency-switch${className ? ` ${className}` : ''}`}
            role="group"
            aria-label="Currency"
        >
            <span
                className="landing-currency-switch-thumb"
                style={{
                    transform: currency === 'IDR' ? 'translateX(0)' : 'translateX(calc(100% + 4px))',
                }}
                aria-hidden
            />
            {SUPPORTED_CURRENCIES.map((code) => {
                const active = currency === code;
                return (
                    <button
                        key={code}
                        type="button"
                        className={`landing-currency-switch-btn${active ? ' is-active' : ''}`}
                        aria-pressed={active}
                        onClick={() => onChange(code)}
                    >
                        {code}
                    </button>
                );
            })}
        </div>
    );
}
