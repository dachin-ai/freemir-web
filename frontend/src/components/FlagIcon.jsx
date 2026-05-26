import React from 'react';

/**
 * Inline SVG country flags rendered at a uniform box (default 22×14) so that
 * different countries align consistently in dropdowns / Segmented controls.
 * Each flag's own viewBox keeps its internal proportions; `preserveAspectRatio
 * = "none"` lets the SVG stretch to fill the requested box exactly.
 */
const baseSvgStyle = {
    display: 'block',
    borderRadius: 2,
    boxShadow: '0 0 0 1px rgba(0,0,0,0.08)',
    flexShrink: 0,
};

function IndonesiaFlag({ width, height }) {
    return (
        <svg
            width={width}
            height={height}
            viewBox="0 0 30 20"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
            style={baseSvgStyle}
            aria-label="Bendera Indonesia"
        >
            <rect width="30" height="10" fill="#FF0000" />
            <rect y="10" width="30" height="10" fill="#FFFFFF" />
        </svg>
    );
}

function MalaysiaFlag({ width, height }) {
    return (
        <svg
            width={width}
            height={height}
            viewBox="0 0 28 14"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
            style={baseSvgStyle}
            aria-label="Bendera Malaysia"
        >
            <rect width="28" height="14" fill="#CC0001" />
            {[1, 3, 5, 7, 9, 11, 13].map((y) => (
                <rect key={y} y={y} width="28" height="1" fill="#FFFFFF" />
            ))}
            <rect width="14" height="7" fill="#010066" />
            <mask id="crescent-mask">
                <rect width="14" height="7" fill="#000" />
                <circle cx="6.8" cy="3.5" r="2" fill="#FFF" />
                <circle cx="7.6" cy="3.5" r="2" fill="#000" />
            </mask>
            <rect width="14" height="7" fill="#FFCC00" mask="url(#crescent-mask)" />
            <polygon
                points="10.2,2 10.6,3.1 11.8,3.1 10.8,3.8 11.2,5 10.2,4.3 9.2,5 9.6,3.8 8.6,3.1 9.8,3.1"
                fill="#FFCC00"
            />
        </svg>
    );
}

export default function FlagIcon({ code, width = 22, height = 14 }) {
    const upper = String(code || '').toUpperCase();
    if (upper === 'ID') return <IndonesiaFlag width={width} height={height} />;
    if (upper === 'MY') return <MalaysiaFlag width={width} height={height} />;
    return null;
}
