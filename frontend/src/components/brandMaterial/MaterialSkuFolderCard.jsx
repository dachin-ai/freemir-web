import React, { useEffect, useRef, useState } from 'react';
import { CaretDownFilled, PictureOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { getBrandMaterialPreviewUrl } from '../../utils/brandMaterialStore';

export default function MaterialSkuFolderCard({
    row,
    onOpen,
    t,
    cardIndex = 0,
    coverOverride,
    previewTick = 0,
}) {
    const mainId = coverOverride?.materialId ?? row.mainPhotoMaterialId ?? null;
    const overrideUrl = coverOverride?.materialId === mainId ? coverOverride?.blobUrl : null;

    const [coverSrc, setCoverSrc] = useState(() => overrideUrl || row.skuInfoImageUrl || null);
    const [imgFailed, setImgFailed] = useState(false);
    const blobRef = useRef(null);

    useEffect(() => {
        setImgFailed(false);
    }, [mainId, overrideUrl, row.skuInfoImageUrl]);

    useEffect(() => {
        let cancelled = false;

        const applySrc = (url) => {
            blobRef.current = url?.startsWith('blob:') ? url : null;
            setCoverSrc(url || null);
        };

        const load = async () => {
            if (overrideUrl) {
                applySrc(overrideUrl);
                return;
            }

            if (mainId) {
                try {
                    const url = await getBrandMaterialPreviewUrl(mainId);
                    if (cancelled) return;
                    if (url) {
                        applySrc(url);
                        return;
                    }
                } catch {
                    /* fall back to SKU_Info image */
                }
            }

            if (!cancelled) {
                applySrc(row.skuInfoImageUrl || null);
            }
        };

        load();

        return () => {
            cancelled = true;
            // Blob URLs are shared via previewUrlCache — do not revoke here.
            blobRef.current = null;
        };
    }, [mainId, overrideUrl, row.skuInfoImageUrl, previewTick]);

    const photoTotal = (row.photoMain || 0) + (row.photoSub || 0);
    const videoTotal = (row.videoMain || 0) + (row.videoSub || 0);
    const name = (row.productName || '').trim();
    const showImage = Boolean(coverSrc) && !imgFailed;

    return (
        <button
            type="button"
            className={`bm-sku-folder-card${row.hasMaterials ? ' has-materials' : ''}`}
            style={{ '--card-index': cardIndex }}
            onClick={() => onOpen(row)}
            aria-label={`${row.sku}${name ? ` — ${name}` : ''}`}
        >
            <div className="bm-sku-folder-card__media">
                <div className="bm-sku-folder-card__media-lift">
                    {showImage ? (
                        <img
                            src={coverSrc}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            draggable={false}
                            onError={() => setImgFailed(true)}
                        />
                    ) : (
                        <span className="bm-sku-folder-card__placeholder" aria-hidden>
                            <PictureOutlined />
                        </span>
                    )}
                    <span className="bm-sku-folder-card__shine" aria-hidden />
                </div>
            </div>
            <div className="bm-sku-folder-card__body">
                <span className="bm-sku-folder-card__sku">{row.sku}</span>
                {name ? (
                    <span className="bm-sku-folder-card__name">{name}</span>
                ) : null}
                <div className="bm-sku-folder-card__stats">
                    <span className="bm-sku-folder-stat" title={t('brandMaterial.typePhoto')}>
                        <PictureOutlined aria-hidden />
                        <span>{photoTotal}</span>
                    </span>
                    <span className="bm-sku-folder-stat" title={t('brandMaterial.typeVideo')}>
                        <PlayCircleOutlined aria-hidden />
                        <span>{videoTotal}</span>
                        {row.isDiscontinued ? (
                            <CaretDownFilled
                                className="bm-sku-folder-disc-arrow"
                                title={t('brandMaterial.discontinuedTooltip')}
                                aria-label={t('brandMaterial.discontinuedTooltip')}
                            />
                        ) : null}
                    </span>
                </div>
            </div>
        </button>
    );
}
