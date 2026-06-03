import React from 'react';

/** ISO 3166-1 alpha-2 → display width & aspect ratio (width / height). */
const FLAG_LAYOUT = {
    id: { width: 48, aspectRatio: '3 / 2' },
    my: { width: 48, aspectRatio: '2 / 1' },
};

/** Renders a country flag image (emoji flags often show as "ID"/"MY" on Windows). */
export default function CountryFlag({ code, alt, className = '' }) {
    const iso = String(code).toLowerCase();
    const layout = FLAG_LAYOUT[iso] || { width: 48, aspectRatio: '3 / 2' };

    return (
        <img
            className={`country-flag ${className}`.trim()}
            src={`https://flagcdn.com/w80/${iso}.png`}
            srcSet={`https://flagcdn.com/w160/${iso}.png 2x`}
            width={layout.width}
            alt={alt}
            loading="lazy"
            decoding="async"
            style={{ aspectRatio: layout.aspectRatio }}
        />
    );
}
