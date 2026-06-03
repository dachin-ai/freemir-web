import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';

export const PROTECT_MEDIA_PROPS = {
    draggable: false,
    onContextMenu: (event) => event.preventDefault(),
    onDragStart: (event) => event.preventDefault(),
};

const blockContextMenu = PROTECT_MEDIA_PROPS.onContextMenu;
const blockDragStart = PROTECT_MEDIA_PROPS.onDragStart;

function ProtectedProductMediaLite({ children, className = '' }) {
    return (
        <div
            className={`landing-protected-media is-lite${className ? ` ${className}` : ''}`}
            onContextMenu={blockContextMenu}
            onDragStart={blockDragStart}
        >
            {children}
        </div>
    );
}

function ProtectedProductMediaFull({ children, className = '', prominent = false }) {
    const { t } = useTranslation();
    const year = new Date().getFullYear();
    const copyright = t('landing.mediaCopyright', { year });

    return (
        <div
            className={`landing-protected-media is-full${prominent ? ' is-prominent' : ''}${className ? ` ${className}` : ''}`}
            onContextMenu={blockContextMenu}
            onDragStart={blockDragStart}
        >
            {children}
            <div className="landing-media-watermark" aria-hidden>
                <span className="landing-media-watermark-text">{copyright}</span>
            </div>
        </div>
    );
}

function ProtectedProductMedia({
    children,
    className = '',
    prominent = false,
    enabled = true,
    lite = true,
}) {
    if (!enabled) {
        return <div className={className}>{children}</div>;
    }

    if (lite && !prominent) {
        return (
            <ProtectedProductMediaLite className={className}>
                {children}
            </ProtectedProductMediaLite>
        );
    }

    return (
        <ProtectedProductMediaFull className={className} prominent={prominent}>
            {children}
        </ProtectedProductMediaFull>
    );
}

export default memo(ProtectedProductMedia);

/** @deprecated Use PROTECT_MEDIA_PROPS */
export function protectMediaProps() {
    return PROTECT_MEDIA_PROPS;
}
