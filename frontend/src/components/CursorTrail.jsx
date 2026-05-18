import { useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';

/** Fewer dots + no gradients ≈ ~10× less work per frame than the old 10-dot trail. */
const DOTS = 3;
const LERP = 0.38;
const SIZES = [9, 6, 4];
const MAX_FPS_MS = 32;
const IDLE_MS = 220;

/**
 * Lightweight cursor tail — stops animating when the pointer is still.
 */
export default function CursorTrail() {
    const canvasRef = useRef(null);
    const { isDark } = useTheme();

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
        if (window.matchMedia('(pointer: coarse)').matches) return undefined;

        const canvas = canvasRef.current;
        if (!canvas) return undefined;

        const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
        const style = isDark
            ? { rgb: '147, 197, 253', alphas: [0.5, 0.28, 0.14] }
            : { rgb: '14, 165, 233', alphas: [0.38, 0.22, 0.1] };

        const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        const chain = Array.from({ length: DOTS }, () => ({ x: target.x, y: target.y }));
        let rafId = 0;
        let active = false;
        let lastFrame = 0;
        let idleTimer = 0;

        const resize = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            canvas.width = w;
            canvas.height = h;
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        };
        resize();
        window.addEventListener('resize', resize, { passive: true });

        const schedule = () => {
            if (!rafId) rafId = requestAnimationFrame(draw);
        };

        const onMove = (e) => {
            target.x = e.clientX;
            target.y = e.clientY;
            active = true;
            window.clearTimeout(idleTimer);
            idleTimer = window.setTimeout(() => {
                active = false;
            }, IDLE_MS);
            schedule();
        };

        const step = (a, b) => a + (b - a) * LERP;

        const draw = (now) => {
            rafId = 0;

            if (!active) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                return;
            }

            if (now - lastFrame < MAX_FPS_MS) {
                schedule();
                return;
            }
            lastFrame = now;

            const w = canvas.width;
            const h = canvas.height;
            ctx.clearRect(0, 0, w, h);

            chain[0].x = step(chain[0].x, target.x);
            chain[0].y = step(chain[0].y, target.y);
            for (let i = 1; i < DOTS; i += 1) {
                chain[i].x = step(chain[i].x, chain[i - 1].x);
                chain[i].y = step(chain[i].y, chain[i - 1].y);
            }

            for (let i = DOTS - 1; i >= 0; i -= 1) {
                const p = chain[i];
                ctx.fillStyle = `rgba(${style.rgb}, ${style.alphas[i]})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, SIZES[i], 0, Math.PI * 2);
                ctx.fill();
            }

            schedule();
        };

        window.addEventListener('mousemove', onMove, { passive: true });

        return () => {
            window.clearTimeout(idleTimer);
            if (rafId) cancelAnimationFrame(rafId);
            window.removeEventListener('resize', resize);
            window.removeEventListener('mousemove', onMove);
        };
    }, [isDark]);

    return (
        <canvas
            ref={canvasRef}
            aria-hidden
            style={{
                position: 'fixed',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 2,
            }}
        />
    );
}
