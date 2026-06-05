import React, { useState } from 'react';
import { InstagramOutlined, PlaySquareOutlined } from '@ant-design/icons';

/**
 * Post thumbnail with referrerPolicy for Instagram CDN hotlinking.
 */
export default function PostThumbnail({ src, platform, size = 'md', className = '' }) {
    const [failed, setFailed] = useState(false);
    const dim = size === 'lg' ? 120 : 52;
    const Icon = platform === 'instagram' ? InstagramOutlined : PlaySquareOutlined;

    if (!src || failed) {
        return (
            <div
                className={`sma-thumb-fallback ${className}`}
                style={{ width: dim, height: dim }}
                aria-hidden
            >
                <Icon />
            </div>
        );
    }

    return (
        <img
            src={src}
            alt=""
            className={`sma-thumb-img ${className}`}
            style={{ width: dim, height: dim }}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            onError={() => setFailed(true)}
        />
    );
}
