import React, { useCallback, useRef, useState } from 'react';

const INTERACTIVE_SELECTOR = [
    'button',
    'input',
    'textarea',
    'a',
    '.ant-checkbox',
    '.bm-catalog-card-media',
    '.bm-catalog-card-actions',
    '.bm-catalog-reorder-handle',
].join(', ');

function normalizeRect(x1, y1, x2, y2) {
    return {
        left: Math.min(x1, x2),
        top: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
    };
}

function rectsIntersect(a, b) {
    return !(
        a.left + a.width < b.left
        || b.left + b.width < a.left
        || a.top + a.height < b.top
        || b.top + b.height < a.top
    );
}

export default function CatalogMarqueeSurface({
    items,
    onMarqueeSelect,
    className,
    children,
    surfaceRef,
}) {
    const ref = useRef(null);

    const setSurfaceRef = useCallback((node) => {
        ref.current = node;
        if (surfaceRef) surfaceRef.current = node;
    }, [surfaceRef]);
    const [box, setBox] = useState(null);

    const handlePointerDown = useCallback((e) => {
        if (e.button !== 0) return;
        if (e.target.closest(INTERACTIVE_SELECTOR)) return;

        const startX = e.clientX;
        const startY = e.clientY;
        let active = false;

        const onMove = (ev) => {
            const dx = Math.abs(ev.clientX - startX);
            const dy = Math.abs(ev.clientY - startY);
            if (!active && (dx > 4 || dy > 4)) {
                active = true;
                document.body.classList.add('bm-catalog-marquee-active');
            }
            if (!active) return;
            setBox(normalizeRect(startX, startY, ev.clientX, ev.clientY));
        };

        const onUp = (ev) => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            document.body.classList.remove('bm-catalog-marquee-active');

            if (active && ref.current) {
                const sel = normalizeRect(startX, startY, ev.clientX, ev.clientY);
                if (sel.width > 2 && sel.height > 2) {
                    const hits = [];
                    ref.current.querySelectorAll('.bm-catalog-card[data-item-id]').forEach((card) => {
                        const cr = card.getBoundingClientRect();
                        const sr = {
                            left: sel.left,
                            top: sel.top,
                            width: sel.width,
                            height: sel.height,
                        };
                        const br = {
                            left: cr.left,
                            top: cr.top,
                            width: cr.width,
                            height: cr.height,
                        };
                        if (rectsIntersect(sr, br)) {
                            const id = card.dataset.itemId;
                            const item = items.find((i) => String(i.id) === id);
                            if (item) hits.push(item);
                        }
                    });
                    onMarqueeSelect?.(hits, { additive: ev.shiftKey });
                }
            }
            setBox(null);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    }, [items, onMarqueeSelect]);

    return (
        <div
            ref={setSurfaceRef}
            className={className}
            onPointerDown={handlePointerDown}
        >
            {children}
            {box && (
                <div
                    className="bm-catalog-marquee-box"
                    style={{
                        position: 'fixed',
                        left: box.left,
                        top: box.top,
                        width: box.width,
                        height: box.height,
                        pointerEvents: 'none',
                    }}
                />
            )}
        </div>
    );
}
