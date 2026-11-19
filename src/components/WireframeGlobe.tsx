import { useEffect, useRef } from 'react';

/**
 * Monochrome 3D dotted wireframe particle sphere matching the reference screenshot's
 * dark square centerpiece. Respects prefers-reduced-motion by rendering a crisp static frame.
 */
export function WireframeGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = 160;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    // Precompute Fibonacci-distributed sphere points with subtle organic wave perturbation
    const points: Array<{ x: number; y: number; z: number }> = [];
    const total = 520;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < total; i++) {
      const y = 1 - (i / (total - 1)) * 2;
      const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = goldenAngle * i;
      const radialScale = 1 - 0.04 * (1 - Math.abs(y)) * Math.sin(theta * 2 + y * 3);
      points.push({
        x: Math.cos(theta) * radiusAtY * radialScale,
        y,
        z: Math.sin(theta) * radiusAtY * radialScale,
      });
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let rafId = 0;
    let angle = 0.65;

    const draw = () => {
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;
      const r = 56;

      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const tilt = 0.35;
      const cosT = Math.cos(tilt);
      const sinT = Math.sin(tilt);

      for (const p of points) {
        // Rotate around Y
        const rx = p.x * cosA - p.z * sinA;
        const rz1 = p.x * sinA + p.z * cosA;
        // Tilt around X
        const ry = p.y * cosT - rz1 * sinT;
        const rz = p.y * sinT + rz1 * cosT;

        const perspective = 2.6 / (2.6 - rz);
        const px = cx + rx * r * perspective;
        const py = cy + ry * r * perspective;

        const alpha = Math.max(0.12, Math.min(0.95, (rz + 1.15) * 0.45));
        const dotSize = rz > 0.2 ? 1.25 : 0.9;

        ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(px, py, dotSize, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    draw();

    if (!reducedMotion) {
      const tick = () => {
        angle += 0.006;
        draw();
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="h-36 w-36 sm:h-40 sm:w-40 select-none"
    />
  );
}
