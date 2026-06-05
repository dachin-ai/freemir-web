const SWAP_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

export function captureCardPositions(container, ids = null) {
    const map = new Map();
    if (!container) return map;

    const idSet = ids ? new Set(ids.map(String)) : null;
    container.querySelectorAll('.bm-catalog-card[data-item-id]').forEach((card) => {
        const id = card.dataset.itemId;
        if (idSet && !idSet.has(id)) return;
        const rect = card.getBoundingClientRect();
        map.set(id, { left: rect.left, top: rect.top });
    });
    return map;
}

export function playSwapFlip(container, beforePositions, ids, { duration = 360 } = {}) {
    if (!container || !beforePositions?.size || !ids?.length) return;

    const idSet = new Set(ids.map(String));
    container.querySelectorAll('.bm-catalog-card[data-item-id]').forEach((card) => {
        const id = card.dataset.itemId;
        if (!idSet.has(id)) return;

        const before = beforePositions.get(id);
        if (!before) return;

        const after = card.getBoundingClientRect();
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

        card.classList.add('is-swap-animating');
        card.style.transition = 'none';
        card.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                card.style.transition = `transform ${duration}ms ${SWAP_EASING}`;
                card.style.transform = '';
            });
        });

        const cleanup = (event) => {
            if (event.propertyName && event.propertyName !== 'transform') return;
            card.classList.remove('is-swap-animating');
            card.style.transition = '';
            card.style.transform = '';
            card.removeEventListener('transitionend', cleanup);
        };
        card.addEventListener('transitionend', cleanup);
    });
}
