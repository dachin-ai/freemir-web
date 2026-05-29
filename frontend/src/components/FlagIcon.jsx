import React, { useId } from 'react';

/** Standard flag ratio (width : height = 2 : 1). */
const FLAG_RATIO = 2;

const baseSvgStyle = {
    display: 'block',
    borderRadius: 2,
    boxShadow: '0 0 0 1px rgba(0,0,0,0.08)',
    flexShrink: 0,
};

function flagSize(width, height) {
    const w = Number(width) || 22;
    if (height != null && height !== '') {
        return { width: w, height: Number(height) };
    }
    return { width: w, height: Math.max(8, Math.round(w / FLAG_RATIO)) };
}

function IndonesiaFlag({ width, height }) {
    const { width: w, height: h } = flagSize(width, height);
    return (
        <svg
            width={w}
            height={h}
            viewBox="0 0 30 20"
            preserveAspectRatio="xMidYMid meet"
            xmlns="http://www.w3.org/2000/svg"
            style={baseSvgStyle}
            aria-label="Bendera Indonesia"
        >
            <rect width="30" height="10" fill="#FF0000" />
            <rect y="10" width="30" height="10" fill="#FFFFFF" />
        </svg>
    );
}

function MalaysiaFlag({ width, height, maskId }) {
    const { width: w, height: h } = flagSize(width, height);
    return (
        <svg
            width={w}
            height={h}
            viewBox="0 0 28 14"
            preserveAspectRatio="xMidYMid meet"
            xmlns="http://www.w3.org/2000/svg"
            style={baseSvgStyle}
            aria-label="Bendera Malaysia"
        >
            <rect width="28" height="14" fill="#CC0001" />
            {[1, 3, 5, 7, 9, 11, 13].map((y) => (
                <rect key={y} y={y} width="28" height="1" fill="#FFFFFF" />
            ))}
            <rect width="14" height="7" fill="#010066" />
            <mask id={maskId}>
                <rect width="14" height="7" fill="#000" />
                <circle cx="6.8" cy="3.5" r="2" fill="#FFF" />
                <circle cx="7.6" cy="3.5" r="2" fill="#000" />
            </mask>
            <rect width="14" height="7" fill="#FFCC00" mask={`url(#${maskId})`} />
            <polygon
                points="10.2,2 10.6,3.1 11.8,3.1 10.8,3.8 11.2,5 10.2,4.3 9.2,5 9.6,3.8 8.6,3.1 9.8,3.1"
                fill="#FFCC00"
            />
        </svg>
    );
}

export default function FlagIcon({ code, width = 22, height }) {
    const maskId = useId().replace(/:/g, '');
    const upper = String(code || '').toUpperCase();
    if (upper === 'ID') return <IndonesiaFlag width={width} height={height} />;
    if (upper === 'MY') return <MalaysiaFlag width={width} height={height} maskId={`my-crescent-${maskId}`} />;
    return null;
}
