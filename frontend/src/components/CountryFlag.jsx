import React from 'react';

/** Renders a country flag image (emoji flags often show as "ID"/"MY" on Windows). */
export default function CountryFlag({ code, alt, className = '' }) {
    const iso = String(code).toLowerCase();
    return (
        <img
            className={`country-flag ${className}`.trim()}
            src={`https://flagcdn.com/w80/${iso}.png`}
            srcSet={`https://flagcdn.com/w160/${iso}.png 2x`}
            width={48}
            height={32}
            alt={alt}
            loading="lazy"
            decoding="async"
        />
    );
}
