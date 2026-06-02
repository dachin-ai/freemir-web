import React from 'react';

const SOCIAL_LINKS = [
    {
        id: 'instagram',
        href: 'https://www.instagram.com/freemirindonesia/',
        label: 'Instagram freemir Indonesia',
    },
    {
        id: 'tiktok',
        href: 'https://www.tiktok.com/@freemirindonesia',
        label: 'TikTok freemir Indonesia',
    },
    {
        id: 'facebook',
        href: 'https://www.facebook.com/freemirindonesia/',
        label: 'Facebook freemir Indonesia',
    },
];

function Icon({ children }) {
    return (
        <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden fill="currentColor">
            {children}
        </svg>
    );
}

const icons = {
    instagram: (
        <Icon>
            <path d="M7.5 2A5.5 5.5 0 0 0 2 7.5v9A5.5 5.5 0 0 0 7.5 22h9a5.5 5.5 0 0 0 5.5-5.5v-9A5.5 5.5 0 0 0 16.5 2h-9zm0 1.8h9a3.7 3.7 0 0 1 3.7 3.7v9a3.7 3.7 0 0 1-3.7 3.7h-9a3.7 3.7 0 0 1-3.7-3.7v-9a3.7 3.7 0 0 1 3.7-3.7zm9.8 1.6a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zM12 7A5 5 0 1 0 12 17 5 5 0 0 0 12 7zm0 1.8A3.2 3.2 0 1 1 12 15.2 3.2 3.2 0 0 1 12 8.8z" />
        </Icon>
    ),
    tiktok: (
        <Icon>
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.77 1.52V6.76a4.85 4.85 0 0 1-1-.07z" />
        </Icon>
    ),
    facebook: (
        <Icon>
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </Icon>
    ),
};

export { SOCIAL_LINKS };

export default function SocialIcon({ id }) {
    return icons[id] || null;
}
