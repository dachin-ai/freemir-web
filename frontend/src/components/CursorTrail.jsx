import { useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';

const DOTS = 10;
const LERP = 0.32;

/** Sizes & opacity: index 0 = at cursor (largest), 9 = tail (smallest). */
const SIZES = [11, 10, 9, 8, 7, 6, 5.5, 4.5, 3.5, 3];

/**
 * Ten circles that chase the cursor — tail follows head, big → small.
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

        const ctx = canvas.getContext('2d', { alpha: true });
        const style = isDark
            ? { rgb: '147, 197, 253', alphas: [0.55, 0.5, 0.45, 0.4, 0.35, 0.28, 0.22, 0.16, 0.11, 0.07] }
            : { rgb: '14, 165, 233', alphas: [0.42, 0.36, 0.3, 0.25, 0.2, 0.16, 0.12, 0.09, 0.06, 0.04] };

        const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        const chain = Array.from({ length: DOTS }, () => ({ x: target.x, y: target.y }));
        let rafId = 0;
        let visible = false;

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = window.innerWidth;
            const h = window.innerHeight;
            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        window.addEventListener('resize', resize, { passive: true });

        const onMove = (e) => {
            target.x = e.clientX;
            target.y = e.clientY;
            visible = true;
        };

        const step = (a, b) => a + (b - a) * LERP;

        const draw = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            ctx.clearRect(0, 0, w, h);

            if (visible) {
                chain[0].x = step(chain[0].x, target.x);
                chain[0].y = step(chain[0].y, target.y);
                for (let i = 1; i < DOTS; i += 1) {
                    chain[i].x = step(chain[i].x, chain[i - 1].x);
                    chain[i].y = step(chain[i].y, chain[i - 1].y);
                }

                for (let i = DOTS - 1; i >= 0; i -= 1) {
                    const p = chain[i];
                    const r = SIZES[i];
                    const a = style.alphas[i];
                    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
                    g.addColorStop(0, `rgba(${style.rgb}, ${a})`);
                    g.addColorStop(0.65, `rgba(${style.rgb}, ${a * 0.45})`);
                    g.addColorStop(1, `rgba(${style.rgb}, 0)`);
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            rafId = requestAnimationFrame(draw);
        };

        rafId = requestAnimationFrame(draw);
        window.addEventListener('mousemove', onMove, { passive: true });

        return () => {
            cancelAnimationFrame(rafId);
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
