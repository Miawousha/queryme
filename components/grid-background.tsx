"use client";

import { useEffect, useRef } from "react";

/**
 * Animated dot grid, ported from the matrice-website. Dots brighten in
 * proximity to the cursor and pulse gently on their own. Single-theme:
 * reads palette constants from CSS variables.
 *
 * Respects `prefers-reduced-motion` (draws one static frame, no loop) and
 * pauses the animation loop while the tab is hidden.
 */
export function GridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    // Palette is read from CSS variables and re-read when the theme changes,
    // so the dot grid follows light/dark.
    const palette = { primaryRgb: "59,130,214", textRgb: "228,235,245" };
    function readPalette() {
      const s = getComputedStyle(document.documentElement);
      palette.primaryRgb = s.getPropertyValue("--color-primary-rgb").trim() || palette.primaryRgb;
      palette.textRgb = s.getPropertyValue("--color-text-primary-rgb").trim() || palette.textRgb;
    }
    readPalette();

    const gap = 40;
    let dots: { x: number; y: number; baseAlpha: number; pulse: number }[] = [];
    const mouse = { x: -1000, y: -1000 };
    let raf = 0;
    let time = 0;

    function resize() {
      if (!canvas || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = [];
      for (let x = gap; x < canvas.offsetWidth; x += gap) {
        for (let y = gap; y < canvas.offsetHeight; y += gap) {
          dots.push({
            x,
            y,
            baseAlpha: 0.06 + Math.random() * 0.04,
            pulse: Math.random() * Math.PI * 2,
          });
        }
      }
      // A static layout (reduced motion) won't be redrawn by the loop —
      // repaint immediately so a resize is reflected.
      if (reduceMotion) renderFrame();
    }

    function renderFrame() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

      for (const d of dots) {
        const dx = d.x - mouse.x;
        const dy = d.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const proximity = Math.max(0, 1 - dist / 180);
        const pulse = reduceMotion ? 0 : Math.sin(time + d.pulse) * 0.02;
        const alpha = d.baseAlpha + pulse + proximity * 0.35;
        const r = 1 + proximity * 1.8;

        if (proximity > 0.1) {
          ctx.beginPath();
          ctx.arc(d.x, d.y, r + 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${palette.primaryRgb},${proximity * 0.08})`;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
        ctx.fillStyle =
          proximity > 0.3
            ? `rgba(${palette.primaryRgb},${alpha})`
            : `rgba(${palette.textRgb},${alpha})`;
        ctx.fill();
      }
    }

    function loop() {
      time += 0.008;
      renderFrame();
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (raf || reduceMotion) return;
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }

    function handleMouse(e: MouseEvent) {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    }

    // While the tab is hidden the loop would burn CPU/GPU drawing unseen
    // frames — pause it and resume on return.
    function handleVisibility() {
      if (document.hidden) stop();
      else start();
    }

    const themeObserver = new MutationObserver(() => {
      readPalette();
      if (reduceMotion) renderFrame();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    resize();
    window.addEventListener("resize", resize);

    if (reduceMotion) {
      renderFrame();
    } else {
      start();
      window.addEventListener("mousemove", handleMouse);
      document.addEventListener("visibilitychange", handleVisibility);
    }

    return () => {
      stop();
      themeObserver.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouse);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      aria-hidden
    />
  );
}
