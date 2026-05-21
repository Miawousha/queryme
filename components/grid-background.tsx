"use client";

import { useEffect, useRef } from "react";

/**
 * Animated dot grid, ported from the matrice-website. Dots brighten in
 * proximity to the cursor and pulse gently on their own. Single-theme:
 * reads palette constants from CSS variables.
 */
export function GridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

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
    }

    function handleMouse(e: MouseEvent) {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    }

    function draw() {
      if (!ctx || !canvas) return;
      time += 0.008;
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

      for (const d of dots) {
        const dx = d.x - mouse.x;
        const dy = d.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const proximity = Math.max(0, 1 - dist / 180);
        const pulse = Math.sin(time + d.pulse) * 0.02;
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
      raf = requestAnimationFrame(draw);
    }

    const themeObserver = new MutationObserver(readPalette);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    resize();
    draw();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", handleMouse);
    return () => {
      cancelAnimationFrame(raf);
      themeObserver.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouse);
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
