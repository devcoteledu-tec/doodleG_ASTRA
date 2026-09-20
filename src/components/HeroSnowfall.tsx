'use client';

import { useEffect, useRef } from 'react';

// Full-bleed background photo, different per breakpoint (matches this
// app's md: breakpoint of 768px used everywhere else). Loaded
// independently of which one is "active" so switching breakpoints (e.g.
// resizing a browser window, or rotating a tablet) doesn't need a fresh
// network request.
const DESKTOP_BG_URL =
  'https://i.postimg.cc/g2KpkCBJ/Chat-GPT-Image-Sep-5-2026-08-26-06-PM.png';
const MOBILE_BG_URL =
  'https://w0.peakpx.com/wallpaper/90/412/HD-wallpaper-pretty-orange-flo-flower-mandala.jpg';

/**
 * Decorative canvas layer for the dark sections: a full-bleed background
 * photo (different image on mobile vs desktop), a light twinkling
 * starfield on top for a bit of extra life, falling snow that drifts away
 * from the mouse/touch point when it gets close, and colored comets
 * streaking through.
 *
 * Purely visual — pointer-events-none, so it never blocks clicks on the
 * search bar or anything else layered on top. Pointer position is tracked
 * on the parent element (not this canvas), since pointer-events-none means
 * the canvas itself never receives the move/leave events directly.
 */
export default function HeroSnowfall() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Respect reduced-motion preference — show a static frame instead of
    // an always-running animation for anyone who's asked for less motion.
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isDesktopQuery = window.matchMedia('(min-width: 768px)');

    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Both backgrounds preload regardless of current breakpoint, so
    // switching between them (resize, rotation) never needs a fresh
    // network request. Each loads independently and is simply skipped if
    // it fails — the black base fill underneath still shows rather than a
    // broken image.
    const desktopBg = new window.Image();
    const mobileBg = new window.Image();
    let desktopBgReady = false;
    let mobileBgReady = false;
    desktopBg.onload = () => { desktopBgReady = true; };
    mobileBg.onload = () => { mobileBgReady = true; };
    desktopBg.src = DESKTOP_BG_URL;
    mobileBg.src = MOBILE_BG_URL;

    function drawBackground() {
      ctx!.fillStyle = '#000000';
      ctx!.fillRect(0, 0, width, height);

      const useDesktop = isDesktopQuery.matches;
      const img = useDesktop ? desktopBg : mobileBg;
      const ready = useDesktop ? desktopBgReady : mobileBgReady;
      if (!ready) return;

      // Cover-fit: scale so the image fills the whole canvas, cropping
      // whatever overflows rather than letterboxing or stretching.
      const scale = Math.max(width / img.width, height / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const dx = (width - drawW) / 2;
      const dy = (height - drawH) / 2;
      ctx!.drawImage(img, dx, dy, drawW, drawH);
    }

    type Star = { x: number; y: number; r: number; baseAlpha: number };
    let twinkleStars: Star[] = [];

    function generateStars() {
      twinkleStars = Array.from({ length: 30 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.3 + 0.4,
        baseAlpha: Math.random() * 0.6 + 0.3,
      }));
    }

    function resize() {
      if (!canvas) return;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      if (width <= 0 || height <= 0) return; // parent not laid out yet — next observer/rAF tick will retry
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      generateStars();
    }
    // Observing both the canvas and its parent is redundant in the common
    // case, but this component runs in more than one section on the page,
    // and belt-and-suspenders here is cheap insurance against whichever
    // one's layout settles later or fires its resize callback less
    // reliably in a given browser.
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resizeObserver.observe(parent);
    // The very first measurement can land before the browser has finished
    // laying out a section that appears later in the page — defer it past
    // two animation frames (one isn't always enough) rather than trusting
    // that clientWidth/clientHeight are already correct the instant this
    // effect runs.
    requestAnimationFrame(() => requestAnimationFrame(resize));

    const FLAKE_COUNT = 55;
    const flakes = Array.from({ length: FLAKE_COUNT }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.8 + 0.8,
      speed: Math.random() * 0.5 + 0.25,
      drift: Math.random() * 0.5 - 0.25,
      phase: Math.random() * Math.PI * 2,
    }));

    const COMET_COLORS = ['#60a5fa', '#4ade80', '#ffffff', '#f87171']; // blue, green, white, red
    type Comet = { x: number; y: number; vx: number; vy: number; color: string };
    let comets: Comet[] = [];
    let nextCometAt = performance.now() + 600 + Math.random() * 900;

    function spawnComet() {
      const fromLeft = Math.random() > 0.5;
      comets.push({
        x: fromLeft ? -60 : width + 60,
        y: Math.random() * height * 0.7,
        vx: (fromLeft ? 1 : -1) * (width / 90),
        vy: height / 240,
        color: COMET_COLORS[Math.floor(Math.random() * COMET_COLORS.length)],
      });
      nextCometAt = performance.now() + 900 + Math.random() * 1400;
    }

    const pointer = { x: -9999, y: -9999, active: false };
    function handlePointerMove(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.active = true;
    }
    function handlePointerLeave() {
      pointer.active = false;
    }
    parent.addEventListener('pointermove', handlePointerMove);
    parent.addEventListener('pointerleave', handlePointerLeave);

    let raf = 0;
    let last = performance.now();
    let twinklePhase = 0;

    function frame(now: number) {
      const dt = Math.min(now - last, 50) / 16.6667; // normalize toward ~60fps steps
      last = now;

      if (width <= 0 || height <= 0) {
        raf = requestAnimationFrame(frame);
        return;
      }

      drawBackground();

      // Twinkling stars on top of the background photo
      twinklePhase += 0.03 * dt;
      for (let i = 0; i < twinkleStars.length; i++) {
        const s = twinkleStars[i];
        const alpha = s.baseAlpha * (0.5 + 0.5 * Math.sin(twinklePhase + i));
        ctx!.beginPath();
        ctx!.fillStyle = `rgba(255, 255, 255, ${Math.max(alpha, 0)})`;
        ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Snow
      ctx!.fillStyle = 'rgba(255, 255, 255, 0.85)';
      for (const f of flakes) {
        f.phase += 0.012 * dt;
        let vx = Math.sin(f.phase) * 0.3 + f.drift;
        const vy = f.speed;

        if (pointer.active) {
          const dx = f.x - pointer.x;
          const dy = f.y - pointer.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const radius = 90;
          if (dist < radius && dist > 0.01) {
            const force = (1 - dist / radius) * 2.4;
            vx += (dx / dist) * force;
          }
        }

        f.x += vx * dt;
        f.y += vy * dt;

        if (f.y > height + 5) { f.y = -5; f.x = Math.random() * width; }
        if (f.x > width + 5) f.x = -5;
        if (f.x < -5) f.x = width + 5;

        ctx!.beginPath();
        ctx!.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Comets — several can be on screen at once
      if (now >= nextCometAt) spawnComet();
      for (const c of comets) {
        c.x += c.vx * dt;
        c.y += c.vy * dt;

        const tailLen = 70;
        const angle = Math.atan2(c.vy, c.vx);
        const tailX = c.x - Math.cos(angle) * tailLen;
        const tailY = c.y - Math.sin(angle) * tailLen;

        const grad = ctx!.createLinearGradient(c.x, c.y, tailX, tailY);
        grad.addColorStop(0, c.color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx!.strokeStyle = grad;
        ctx!.lineWidth = 2.5;
        ctx!.lineCap = 'round';
        ctx!.beginPath();
        ctx!.moveTo(c.x, c.y);
        ctx!.lineTo(tailX, tailY);
        ctx!.stroke();

        ctx!.fillStyle = c.color;
        ctx!.beginPath();
        ctx!.arc(c.x, c.y, 2.5, 0, Math.PI * 2);
        ctx!.fill();
      }
      comets = comets.filter((c) => c.x > -100 && c.x < width + 100 && c.y < height + 100);

      raf = requestAnimationFrame(frame);
    }

    if (prefersReducedMotion) {
      // One static frame: background photo + snow in place, no comets, no loop.
      drawBackground();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      for (const f of flakes) {
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      parent.removeEventListener('pointermove', handlePointerMove);
      parent.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" />;
}
