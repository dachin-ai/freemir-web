import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Checkbox, Empty, Spin, Typography, message } from 'antd';
import { useTranslation } from 'react-i18next';
import CatalogMarqueeSurface from './CatalogMarqueeSurface';
import MaterialCatalogCard from './MaterialCatalogCard';
import { reorderBrandMaterialSubs } from '../../utils/brandMaterialStore';
import { captureCardPositions, playSwapFlip } from '../../utils/catalogSwapFlip';

const { Text } = Typography;

function itemIsVideo(item) {
    return item.mediaType === 'video';
}

function sortItems(items) {
    return [...items].sort((a, b) => {
        const catA = a.category === 'main' ? 0 : 1;
        const catB = b.category === 'main' ? 0 : 1;
        if (catA !== catB) return catA - catB;
        const subA = a.subIndex ?? 0;
        const subB = b.subIndex ?? 0;
        if (subA !== subB) return subA - subB;
        return String(a.id).localeCompare(String(b.id));
    });
}

function swapIds(list, idA, idB) {
    const a = list.findIndex((i) => String(i) === String(idA));
    const b = list.findIndex((i) => String(i) === String(idB));
    if (a < 0 || b < 0 || a === b) return list;
    const next = [...list];
    [next[a], next[b]] = [next[b], next[a]];
    return next;
}

function resolveSwapTarget(gridEl, draggedId, x, y, subs) {
    if (!gridEl) return null;

    const subIds = new Set(subs.map((item) => String(item.id)));
    const cards = gridEl.querySelectorAll('.bm-catalog-card[data-item-id]');

    for (const card of cards) {
        const id = card.dataset.itemId;
        if (!subIds.has(id) || id === String(draggedId)) continue;

        const rect = card.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            return subs.find((item) => String(item.id) === id)?.id ?? null;
        }
    }

    return null;
}

function CatalogSection({
    title,
    mediaType,
    items,
    sku,
    fallbackUrl,
    selectedIds,
    onSelect,
    onMarqueeSelect,
    onPreview,
    onDownload,
    onEdit,
    onReorder,
    t,
}) {
    const subs = items.filter((i) => i.category === 'sub');
    const mains = items.filter((i) => i.category === 'main');
    const canReorderSubs = subs.length > 1;
    const sortedSubIds = useMemo(() => sortItems(subs).map((i) => i.id), [subs]);

    const gridRef = useRef(null);
    const dragRef = useRef({ active: false, rafId: null });

    const [draggingId, setDraggingId] = useState(null);
    const [swapTargetId, setSwapTargetId] = useState(null);

    const ordered = useMemo(() => [...mains, ...sortItems(subs)], [mains, subs]);

    const commitSwap = useCallback(async (draggedId, targetId, previousSubIds) => {
        const nextSubIds = swapIds(previousSubIds, draggedId, targetId);
        if (nextSubIds.join(',') === previousSubIds.join(',')) return;

        const beforePositions = captureCardPositions(
            gridRef.current,
            [draggedId, targetId],
        );

        onReorder(mediaType, nextSubIds);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                playSwapFlip(gridRef.current, beforePositions, [draggedId, targetId]);
            });
        });

        try {
            await reorderBrandMaterialSubs(sku, mediaType, nextSubIds);
            message.success(t('brandMaterial.msgReorderOk'));
        } catch {
            message.error(t('brandMaterial.msgReorderFail'));
            onReorder(mediaType, previousSubIds);
        }
    }, [mediaType, onReorder, sku, t]);

    const handleReorderPointerDown = useCallback((e, itemId) => {
        if (!canReorderSubs || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        const sourceEl = e.currentTarget;
        const previousSubIds = [...sortedSubIds];
        let targetId = null;

        dragRef.current = { active: true, rafId: null };
        setDraggingId(itemId);
        document.body.classList.add('bm-catalog-reorder-active');

        try {
            sourceEl.setPointerCapture(e.pointerId);
        } catch {
            // ignore if capture unsupported
        }

        const onMove = (ev) => {
            if (!dragRef.current.active || dragRef.current.rafId) return;
            dragRef.current.rafId = requestAnimationFrame(() => {
                dragRef.current.rafId = null;
                const hit = resolveSwapTarget(gridRef.current, itemId, ev.clientX, ev.clientY, subs);
                targetId = hit;
                setSwapTargetId(hit);
            });
        };

        const onUp = async () => {
            sourceEl.removeEventListener('pointermove', onMove);
            sourceEl.removeEventListener('pointerup', onUp);
            sourceEl.removeEventListener('pointercancel', onUp);

            if (dragRef.current.rafId) {
                cancelAnimationFrame(dragRef.current.rafId);
            }

            try {
                sourceEl.releasePointerCapture(e.pointerId);
            } catch {
                // ignore
            }

            dragRef.current = { active: false, rafId: null };
            setDraggingId(null);
            setSwapTargetId(null);
            document.body.classList.remove('bm-catalog-reorder-active');

            if (targetId) {
                await commitSwap(itemId, targetId, previousSubIds);
            }
        };

        sourceEl.addEventListener('pointermove', onMove);
        sourceEl.addEventListener('pointerup', onUp);
        sourceEl.addEventListener('pointercancel', onUp);
    }, [canReorderSubs, commitSwap, sortedSubIds, subs]);

    if (!ordered.length) return null;

    return (
        <section className="bm-catalog-section">
            <div className="bm-catalog-section-head">
                <h3 className="bm-catalog-section-title">{title}</h3>
                <span className="bm-catalog-section-bar" />
                <Text type="secondary" style={{ fontSize: 11 }}>
                    {t('brandMaterial.itemCount', { count: ordered.length })}
                </Text>
            </div>
            <CatalogMarqueeSurface
                surfaceRef={gridRef}
                className={[
                    'bm-catalog-grid',
                    'bm-catalog-marquee-surface',
                    draggingId ? 'is-reordering' : '',
                ].filter(Boolean).join(' ')}
                items={ordered}
                onMarqueeSelect={onMarqueeSelect}
            >
                {ordered.map((item) => (
                    <MaterialCatalogCard
                        key={item.id}
                        item={item}
                        fallbackUrl={fallbackUrl}
                        selected={selectedIds.has(item.id)}
                        dragging={draggingId === item.id}
                        dropTarget={swapTargetId === item.id && draggingId !== item.id}
                        canReorder={item.category === 'sub' && canReorderSubs}
                        onSelect={onSelect}
                        onPreview={onPreview}
                        onDownload={onDownload}
                        onEdit={onEdit}
                        onReorderPointerDown={handleReorderPointerDown}
                        t={t}
                    />
                ))}
            </CatalogMarqueeSurface>
        </section>
    );
}

export default function MaterialCatalogGrid({
    sku,
    items,
    loading,
    typeFilter,
    thumbFallback,
    selectedIds,
    onSelect,
    onSelectMany,
    onPreview,
    onDownload,
    onEdit,
    onItemsChange,
    noteQuery = '',
}) {
    const { t } = useTranslation();
    const [localItems, setLocalItems] = useState(items);

    React.useEffect(() => {
        setLocalItems(items);
    }, [items]);

    const photos = useMemo(
        () => localItems.filter((i) => !itemIsVideo(i)),
        [localItems],
    );
    const videos = useMemo(
        () => localItems.filter((i) => itemIsVideo(i)),
        [localItems],
    );

    const allSelected = localItems.length > 0 && localItems.every((i) => selectedIds.has(i.id));
    const someSelected = localItems.some((i) => selectedIds.has(i.id));

    const toggleSelectAll = (checked) => {
        localItems.forEach((item) => onSelect(item.id, checked, item));
    };

    const handleMarqueeSelect = useCallback((hitItems, { additive = false } = {}) => {
        if (!hitItems.length) return;
        if (onSelectMany) {
            onSelectMany(hitItems, true, { replace: !additive, scopeItems: localItems });
            return;
        }
        if (!additive) {
            localItems.forEach((item) => {
                if (selectedIds.has(item.id)) onSelect(item.id, false, item);
            });
        }
        hitItems.forEach((item) => onSelect(item.id, true, item));
    }, [localItems, onSelect, onSelectMany, selectedIds]);

    const handleReorder = useCallback((mediaType, orderedSubIds) => {
        setLocalItems((prev) => {
            const isTargetType = (i) => (
                mediaType === 'video' ? itemIsVideo(i) : !itemIsVideo(i)
            );
            const next = prev.map((item) => {
                if (item.category !== 'sub' || !isTargetType(item)) return item;
                const idx = orderedSubIds.indexOf(item.id);
                if (idx < 0) return item;
                return { ...item, subIndex: idx + 1 };
            });
            onItemsChange?.(next);
            return next;
        });
    }, [onItemsChange]);

    if (loading) {
        return (
            <div style={{ padding: 48, textAlign: 'center' }}>
                <Spin />
            </div>
        );
    }

    const showPhotos = typeFilter === 'all' || typeFilter === 'photo';
    const showVideos = typeFilter === 'all' || typeFilter === 'video';
    const hasDraggableSubs = localItems.some((i) => i.category === 'sub');
    const showEmpty = !localItems.length;
    const emptyDesc = noteQuery.trim()
        ? t('brandMaterial.noteFilterEmpty')
        : t('brandMaterial.skuDetailEmpty');

    return (
        <div className="bm-catalog-root">
            <div className="bm-catalog-toolbar">
                <label className="bm-catalog-select-all">
                    <Checkbox
                        checked={allSelected}
                        indeterminate={someSelected && !allSelected}
                        disabled={showEmpty}
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                    />
                    <Text style={{ fontSize: 12 }}>{t('brandMaterial.selectAllShort')}</Text>
                </label>
                <Text className="bm-catalog-hint">{t('brandMaterial.catalogMarqueeHint')}</Text>
                {hasDraggableSubs && (
                    <Text className="bm-catalog-hint">{t('brandMaterial.catalogDragHint')}</Text>
                )}
            </div>

            {showEmpty ? (
                <Empty description={emptyDesc} style={{ padding: '48px 0' }} />
            ) : null}

            {!showEmpty && showPhotos && (
                <CatalogSection
                    title={t('brandMaterial.typePhoto')}
                    mediaType="photo"
                    items={photos}
                    sku={sku}
                    fallbackUrl={thumbFallback}
                    selectedIds={selectedIds}
                    onSelect={onSelect}
                    onMarqueeSelect={handleMarqueeSelect}
                    onPreview={onPreview}
                    onDownload={onDownload}
                    onEdit={onEdit}
                    onReorder={handleReorder}
                    t={t}
                />
            )}

            {!showEmpty && showVideos && (
                <CatalogSection
                    title={t('brandMaterial.typeVideo')}
                    mediaType="video"
                    items={videos}
                    sku={sku}
                    fallbackUrl={null}
                    selectedIds={selectedIds}
                    onSelect={onSelect}
                    onMarqueeSelect={handleMarqueeSelect}
                    onPreview={onPreview}
                    onDownload={onDownload}
                    onEdit={onEdit}
                    onReorder={handleReorder}
                    t={t}
                />
            )}
        </div>
    );
}
