import { useEffect } from 'react';

const SHIELD_MS = 2400;

let activeListeners = 0;
let removeGlobalListeners = null;

function attachGlobalListeners() {
    const root = document.documentElement;
    let shieldTimer = 0;

    const activateShield = () => {
        root.classList.add('landing-screenshot-shield');
        window.clearTimeout(shieldTimer);
        shieldTimer = window.setTimeout(() => {
            root.classList.remove('landing-screenshot-shield');
        }, SHIELD_MS);
    };

    const onKeyUp = (event) => {
        if (event.key !== 'PrintScreen') return;
        event.preventDefault();
        activateShield();
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText('').catch(() => {});
        }
    };

    const onKeyDown = (event) => {
        if (!event.shiftKey || !(event.metaKey || event.ctrlKey)) return;
        const key = String(event.key || '').toLowerCase();
        if (key === 's' || key === '3' || key === '4' || key === '5') {
            activateShield();
        }
    };

    const onVisibilityChange = () => {
        root.classList.toggle('landing-privacy-shield', document.hidden);
    };

    const onCopy = (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest('.landing-protected-media')) {
            event.preventDefault();
        }
    };

    document.addEventListener('keyup', onKeyUp, { passive: false });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('copy', onCopy);

    return () => {
        window.clearTimeout(shieldTimer);
        document.removeEventListener('keyup', onKeyUp);
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        document.removeEventListener('copy', onCopy);
        root.classList.remove('landing-screenshot-shield', 'landing-privacy-shield');
    };
}

/**
 * Best-effort deterrent for casual copy / screenshot on public landing pages.
 * Registers document listeners once while any landing page is mounted.
 */
export function useLandingMediaProtection(enabled = true) {
    useEffect(() => {
        if (!enabled || typeof document === 'undefined') return undefined;

        if (activeListeners === 0) {
            removeGlobalListeners = attachGlobalListeners();
        }
        activeListeners += 1;

        return () => {
            activeListeners = Math.max(0, activeListeners - 1);
            if (activeListeners === 0 && removeGlobalListeners) {
                removeGlobalListeners();
                removeGlobalListeners = null;
            }
        };
    }, [enabled]);
}
