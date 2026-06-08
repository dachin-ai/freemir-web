import React from 'react';
import { Tag as AntTag } from 'antd';
import MaterialThumb from './MaterialThumb';
import { displayLabel } from '../../utils/brandMaterialStore';

function itemIsVideo(item) {
    return item.mediaType === 'video';
}

export default function MaterialSearchResultCard({
    item,
    onPreview,
    onOpenSku,
    t,
    cardIndex = 0,
}) {
    const isVideo = itemIsVideo(item);
    const productName = (item.productName || '').trim();
    const note = (item.note || '').trim();

    return (
        <article
            className="bm-detail-search-card"
            style={{ '--card-index': cardIndex }}
        >
            <button
                type="button"
                className="bm-detail-search-card__media"
                onClick={() => onPreview?.(item)}
                aria-label={t('brandMaterial.previewOpen')}
            >
                <MaterialThumb item={item} fill />
            </button>

            <div className="bm-detail-search-card__body">
                <button
                    type="button"
                    className="bm-detail-search-card__sku"
                    onClick={() => onOpenSku?.(item.sku)}
                >
                    {item.sku}
                </button>
                {productName ? (
                    <p className="bm-detail-search-card__name" title={productName}>
                        {productName}
                    </p>
                ) : null}
                <div className="bm-detail-search-card__tags">
                    <AntTag
                        className="bm-catalog-tag bm-catalog-tag--category"
                        color={item.category === 'main' ? 'green' : 'blue'}
                    >
                        {displayLabel(item, t, { compact: true })}
                    </AntTag>
                    <AntTag
                        className="bm-catalog-tag bm-catalog-tag--type"
                        color={isVideo ? 'purple' : 'cyan'}
                    >
                        {isVideo ? t('brandMaterial.typeVideoShort') : t('brandMaterial.typePhotoShort')}
                    </AntTag>
                </div>
                {note ? (
                    <p className="bm-detail-search-card__note" title={note}>
                        {note}
                    </p>
                ) : (
                    <p className="bm-detail-search-card__note is-empty">
                        {t('brandMaterial.detailSearchNoNote')}
                    </p>
                )}
            </div>
        </article>
    );
}
