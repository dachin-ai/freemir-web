import React, { useEffect, useRef, useState } from 'react';
import { Modal, Spin, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { getBrandMaterialBlob } from '../../utils/brandMaterialStore';
import { isVideoMime } from '../../utils/brandMaterialMedia';

const { Text } = Typography;

function revokeIfBlob(url) {
    if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
    }
}

export default function MaterialPreviewModal({ item, open, onClose }) {
    const { t } = useTranslation();
    const [src, setSrc] = useState(null);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    const blobRef = useRef(null);
    const videoRef = useRef(null);
    const itemRef = useRef(null);

    if (open && item) {
        itemRef.current = item;
    }

    const displayItem = open ? item : itemRef.current;
    const isVideo = displayItem
        && (displayItem.mediaType === 'video' || isVideoMime(displayItem.mimeType));

    const clearBlob = () => {
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.removeAttribute('src');
            videoRef.current.load();
        }
        revokeIfBlob(blobRef.current);
        blobRef.current = null;
        setSrc(null);
    };

    useEffect(() => {
        if (!open || !item?.id) {
            clearBlob();
            setFailed(false);
            setLoading(false);
            return undefined;
        }

        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setFailed(false);
            clearBlob();

            try {
                const blob = await getBrandMaterialBlob(item.id);
                if (cancelled) return;
                if (!blob?.size) {
                    setFailed(true);
                    return;
                }
                const url = URL.createObjectURL(blob);
                blobRef.current = url;
                setSrc(url);
            } catch {
                if (!cancelled) setFailed(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
            clearBlob();
        };
    }, [open, item?.id]);

    const handleClose = () => {
        clearBlob();
        setFailed(false);
        setLoading(false);
        onClose();
    };

    return (
        <Modal
            title={displayItem ? (
                <div>
                    <Text strong style={{ fontFamily: 'monospace' }}>{displayItem.sku}</Text>
                    {displayItem.note?.trim() ? (
                        <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 4, fontWeight: 400 }}>
                            {displayItem.note.trim()}
                        </Text>
                    ) : null}
                </div>
            ) : null}
            open={open}
            onCancel={handleClose}
            footer={null}
            centered
            width="min(92vw, 960px)"
            destroyOnClose
            maskClosable
            styles={{
                body: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 200,
                    padding: '20px 24px',
                },
            }}
        >
            {loading && <Spin size="large" />}
            {!loading && failed && (
                <Text type="danger">{t('brandMaterial.previewLoadFail')}</Text>
            )}
            {!loading && !failed && displayItem && src && (
                isVideo ? (
                    <video
                        ref={videoRef}
                        src={src}
                        controls
                        autoPlay
                        playsInline
                        style={{
                            maxWidth: '100%',
                            maxHeight: 'min(78vh, 720px)',
                            borderRadius: 8,
                            background: '#000',
                        }}
                    />
                ) : (
                    <img
                        src={src}
                        alt={displayItem.sku}
                        style={{
                            maxWidth: '100%',
                            maxHeight: 'min(78vh, 720px)',
                            objectFit: 'contain',
                            borderRadius: 8,
                        }}
                    />
                )
            )}
        </Modal>
    );
}
