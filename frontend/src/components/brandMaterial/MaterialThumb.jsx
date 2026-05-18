import React, { useEffect, useRef, useState } from 'react';
import { Image, Typography } from 'antd';
import { getBrandMaterialPreviewBlob } from '../../utils/brandMaterialStore';
import {
    brandMaterialPublicMediaUrl,
    isVideoMime,
    videoFramePosterFromUrl,
} from '../../utils/brandMaterialMedia';

const { Text } = Typography;

const thumbPlaceholderStyle = {
    width: 48,
    height: 48,
    borderRadius: 8,
    background: 'var(--bg-subtle, rgba(0,0,0,0.04))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
};

const thumbMediaStyle = {
    width: 48,
    height: 48,
    objectFit: 'cover',
    borderRadius: 8,
    display: 'block',
};

function ThumbClickWrap({ onClick, children, label }) {
    if (!onClick) return children;
    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            aria-label={label}
            style={{
                display: 'block',
                padding: 0,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                lineHeight: 0,
            }}
        >
            {children}
        </button>
    );
}

function VideoInlineThumb({ gcsObjectPath, alt, onClick }) {
    const url = brandMaterialPublicMediaUrl(gcsObjectPath);
    if (!url) {
        return (
            <div style={thumbPlaceholderStyle}>
                <Text type="secondary" style={{ fontSize: 10 }}>—</Text>
            </div>
        );
    }

    const video = (
        <video
            src={`${url}#t=0.1`}
            muted
            playsInline
            preload="metadata"
            aria-label={alt}
            style={thumbMediaStyle}
        />
    );
    return (
        <ThumbClickWrap onClick={onClick} label={alt}>
            {video}
        </ThumbClickWrap>
    );
}

/**
 * Compact table thumbnail — API preview (JPEG poster) with video fallbacks.
 */
export default function MaterialThumb({ item, fallbackUrl, onPreview }) {
    const isVideo = item.mediaType === 'video' || isVideoMime(item.mimeType);
    const [src, setSrc] = useState(!isVideo ? (fallbackUrl || null) : null);
    const [useVideoTag, setUseVideoTag] = useState(false);
    const blobRef = useRef(null);

    const replaceBlob = (nextUrl) => {
        if (blobRef.current && blobRef.current !== nextUrl) {
            URL.revokeObjectURL(blobRef.current);
        }
        if (nextUrl?.startsWith('blob:')) {
            blobRef.current = nextUrl;
        } else {
            blobRef.current = null;
        }
        setSrc(nextUrl || null);
    };

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setUseVideoTag(false);
            try {
                const blob = await getBrandMaterialPreviewBlob(item.id);
                if (cancelled) return;
                if (blob?.size) {
                    replaceBlob(URL.createObjectURL(blob));
                    return;
                }
            } catch {
                /* try fallbacks below */
            }

            if (cancelled) return;

            if (isVideo && item.gcsObjectPath) {
                const publicUrl = brandMaterialPublicMediaUrl(item.gcsObjectPath);
                if (publicUrl) {
                    const poster = await videoFramePosterFromUrl(publicUrl);
                    if (cancelled) return;
                    if (poster?.size) {
                        replaceBlob(URL.createObjectURL(poster));
                        return;
                    }
                }
                if (!cancelled) {
                    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
                    blobRef.current = null;
                    setSrc(null);
                    setUseVideoTag(true);
                }
                return;
            }

            if (!cancelled) {
                if (blobRef.current) URL.revokeObjectURL(blobRef.current);
                blobRef.current = null;
                setSrc(fallbackUrl || null);
            }
        };

        load();
        return () => {
            cancelled = true;
            if (blobRef.current) {
                URL.revokeObjectURL(blobRef.current);
                blobRef.current = null;
            }
        };
    }, [item.id, item.gcsObjectPath, item.mediaType, item.mimeType, fallbackUrl, isVideo]);

    const handleClick = onPreview ? () => onPreview(item) : undefined;

    if (useVideoTag && item.gcsObjectPath) {
        return (
            <VideoInlineThumb
                gcsObjectPath={item.gcsObjectPath}
                alt={item.sku}
                onClick={handleClick}
            />
        );
    }

    if (!src) {
        return (
            <div style={thumbPlaceholderStyle}>
                <Text type="secondary" style={{ fontSize: 10 }}>—</Text>
            </div>
        );
    }

    const thumb = (
        <Image
            src={src}
            alt={item.sku}
            width={48}
            height={48}
            style={thumbMediaStyle}
            preview={false}
            fallback="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
        />
    );

    return (
        <ThumbClickWrap onClick={handleClick} label={item.sku}>
            {thumb}
        </ThumbClickWrap>
    );
}
