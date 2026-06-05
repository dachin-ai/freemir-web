import React from 'react';
import { Button, Checkbox, Tag, Tooltip } from 'antd';
import { DownloadOutlined, EditOutlined, HolderOutlined } from '@ant-design/icons';
import MaterialThumb from './MaterialThumb';
import { displayLabel } from '../../utils/brandMaterialStore';

function itemIsVideo(item) {
    return item.mediaType === 'video';
}

export default function MaterialCatalogCard({
    item,
    fallbackUrl,
    selected,
    dragging,
    dropTarget,
    canReorder,
    onSelect,
    onPreview,
    onDownload,
    onEdit,
    onReorderPointerDown,
    t,
}) {
    const isVideo = itemIsVideo(item);

    return (
        <article
            data-item-id={item.id}
            className={[
                'bm-catalog-card',
                selected ? 'is-selected' : '',
                dragging ? 'is-dragging' : '',
                dropTarget ? 'is-drop-target' : '',
                canReorder ? 'is-reorderable' : '',
            ].filter(Boolean).join(' ')}
        >
            <div className="bm-catalog-card-check">
                <Checkbox
                    checked={selected}
                    onChange={(e) => onSelect(item.id, e.target.checked, item)}
                    onClick={(e) => e.stopPropagation()}
                />
            </div>

            <div
                className="bm-catalog-card-media"
                onClick={(e) => {
                    e.stopPropagation();
                    onPreview?.(item);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onPreview?.(item);
                    }
                }}
                aria-label={t('brandMaterial.previewOpen')}
            >
                <MaterialThumb
                    item={item}
                    fallbackUrl={
                        item.category === 'main' && !isVideo ? fallbackUrl : null
                    }
                    fill
                />
            </div>

            <div className="bm-catalog-card-actions">
                <Tooltip title={t('brandMaterial.download')}>
                    <Button
                        type="text"
                        size="small"
                        icon={<DownloadOutlined />}
                        onClick={(e) => {
                            e.stopPropagation();
                            onDownload(item);
                        }}
                        aria-label={t('brandMaterial.download')}
                    />
                </Tooltip>
                <Tooltip title={t('brandMaterial.edit')}>
                    <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={(e) => {
                            e.stopPropagation();
                            onEdit(item);
                        }}
                        aria-label={t('brandMaterial.edit')}
                    />
                </Tooltip>
            </div>

            <div
                className={[
                    'bm-catalog-card-footer',
                    canReorder ? 'bm-catalog-reorder-handle' : '',
                ].filter(Boolean).join(' ')}
                onPointerDown={canReorder ? (e) => onReorderPointerDown?.(e, item.id) : undefined}
                title={canReorder ? t('brandMaterial.catalogDragHandle') : undefined}
            >
                {canReorder && (
                    <span className="bm-catalog-reorder-grip" aria-hidden>
                        <HolderOutlined />
                    </span>
                )}
                <div className="bm-catalog-card-footer-body">
                    <div className="bm-catalog-card-tags">
                        <Tag
                            className="bm-catalog-tag bm-catalog-tag--category"
                            color={item.category === 'main' ? 'green' : 'blue'}
                        >
                            {displayLabel(item, t, { compact: true })}
                        </Tag>
                        <Tag
                            className="bm-catalog-tag bm-catalog-tag--type"
                            color={isVideo ? 'purple' : 'cyan'}
                        >
                            {isVideo ? t('brandMaterial.typeVideoShort') : t('brandMaterial.typePhotoShort')}
                        </Tag>
                    </div>
                    {(item.note || '').trim() ? (
                        <p className="bm-catalog-card-note">{item.note.trim()}</p>
                    ) : null}
                </div>
            </div>
        </article>
    );
}
