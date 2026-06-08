import React, { useState } from 'react';
import { CaretDownFilled, PictureOutlined, PlayCircleOutlined } from '@ant-design/icons';

export default function MaterialSkuFolderCard({ row, onOpen, t, cardIndex = 0 }) {
    const [imgFailed, setImgFailed] = useState(!row.skuInfoImageUrl);
    const photoTotal = (row.photoMain || 0) + (row.photoSub || 0);
    const videoTotal = (row.videoMain || 0) + (row.videoSub || 0);
    const name = (row.productName || '').trim();

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
                    {!imgFailed && row.skuInfoImageUrl ? (
                        <img
                            src={row.skuInfoImageUrl}
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
