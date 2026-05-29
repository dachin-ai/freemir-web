import React from 'react';

const defaults = {
    width: 28,
    height: 28,
    strokeWidth: 1.6,
    stroke: 'currentColor',
    fill: 'none',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
};

function Icon({ children, ...rest }) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden {...defaults} {...rest}>
            {children}
        </svg>
    );
}

const icons = {
    kuali: (
        <Icon>
            <circle cx="12" cy="13" r="6.5" />
            <path d="M5 13h14M12 6.5V4M9 4.5h6" />
        </Icon>
    ),
    periuk: (
        <Icon>
            <path d="M6 10h12v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-8z" />
            <path d="M8 10V8a4 4 0 0 1 8 0v2M9 6h6" />
        </Icon>
    ),
    pressure: (
        <Icon>
            <rect x="7" y="9" width="10" height="10" rx="2" />
            <path d="M9 9V7a3 3 0 0 1 6 0v2M12 12v3" />
            <circle cx="12" cy="11.5" r="0.8" fill="currentColor" stroke="none" />
        </Icon>
    ),
    rice: (
        <Icon>
            <rect x="6" y="8" width="12" height="11" rx="2" />
            <path d="M8 8V6.5A4 4 0 0 1 16 6.5V8M9 14h6" />
            <path d="M10 11h4" strokeWidth="1.2" />
        </Icon>
    ),
    blender: (
        <Icon>
            <path d="M9 4h6l1 4H8l1-4zM8 8h8v9a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8z" />
            <path d="M10 12h4M11 16h2" strokeWidth="1.2" />
        </Icon>
    ),
    airfryer: (
        <Icon>
            <rect x="5" y="7" width="14" height="12" rx="2.5" />
            <path d="M8 7V5.5h8V7M9 12h6M9 15h4" strokeWidth="1.2" />
            <circle cx="17" cy="10" r="1" fill="currentColor" stroke="none" />
        </Icon>
    ),
    utensils: (
        <Icon>
            <path d="M8 4v7a2 2 0 0 0 4 0V4M10 4v16M16 4v5a2.5 2.5 0 0 1-5 0V4M13.5 9v11" />
        </Icon>
    ),
    knife: (
        <Icon>
            <path d="M6 18l10-10M16 8l2-2M8 16l-1.5 3.5L6 18l1.5-1.5L11 15" />
            <path d="M14 6l4 4" strokeWidth="1.8" />
        </Icon>
    ),
};

export default function LandingCategoryIcon({ id }) {
    return icons[id] || icons.kuali;
}
