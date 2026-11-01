"use client";

import { useEffect, useRef } from "react";

type Variant = "page" | "footer";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function gaussian() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function particleCount(width: number, variant: Variant) {
  if (variant === "footer") return width >= 768 ? 160 : 70;
  return width >= 768 ? 2000 : 800;
}

function makeParticle(width: number, height: number, variant: Variant): Particle {
  let x: number;
  let y: number;

  if (variant === "footer") {
    x = rand(0, width);
    y = rand(0, height);
  } else {
    const cx = width * 0.72;
    const cy = height * 0.72;
    const rx = width * 0.4;
    const ry = height * 0.46;
    const onRing = Math.random() < 0.72;
    const angle = rand(0, Math.PI * 2);
    const radiusJitter = onRing ? rand(0.86, 1.14) : rand(0.05, 0.82);
    x = cx + Math.cos(angle) * rx * radiusJitter;
    y = cy + Math.sin(angle) * ry * radiusJitter;
  }

  const grey = variant === "footer" ? rand(148, 176) : rand(210, 255);
  const alpha = variant === "footer" ? rand(0.05, 0.18) : rand(0.13, 0.6);

  return {
    x,
    y,
    vx: 0,
    vy: 0,
    r: rand(0.5, 1.8),
    color: `rgba(${grey | 0}, ${grey | 0}, ${grey | 0}, ${alpha})`,
  };
}

export default function PointCloud({ variant = "page" }: { variant?: Variant }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const parent = canvas.parentElement;
    let particles: Particle[] = [];
    let frame = 0;
    let running = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const width = canvas.clientWidth || parent?.clientWidth || window.innerWidth;
      const height = canvas.clientHeight || parent?.clientHeight || window.innerHeight;
      if (width < 1 || height < 1) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = Array.from({ length: particleCount(width, variant) }, () =>
        makeParticle(width, height, variant)
      );
    };

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      ctx.clearRect(0, 0, width, height);
      for (const particle of particles) {
        ctx.beginPath();
        ctx.fillStyle = particle.color;
        ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const step = () => {
      if (!running || document.hidden) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const pad = 8;
      for (const particle of particles) {
        const kick = variant === "footer" ? rand(0.008, 0.018) : rand(0.02, 0.05);
        particle.vx = particle.vx * 0.985 + gaussian() * kick;
        particle.vy = particle.vy * 0.985 + gaussian() * kick;
        particle.x += particle.vx;
        particle.y += particle.vy;
        if (particle.x < -pad) particle.x = width + pad;
        if (particle.x > width + pad) particle.x = -pad;
        if (particle.y < -pad) particle.y = height + pad;
        if (particle.y > height + pad) particle.y = -pad;
      }
      draw();
      frame = requestAnimationFrame(step);
    };

    const start = () => {
      if (!running || reduced || document.hidden) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(step);
    };

    resize();
    draw();
    start();

    const observed = variant === "footer" && parent ? parent : document.documentElement;
    const observer = new ResizeObserver(() => {
      resize();
      if (reduced) draw();
    });
    observer.observe(observed);

    const onVisibility = () => {
      if (!document.hidden) start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [variant]);

  const className =
    variant === "footer"
      ? "pointer-events-none absolute inset-0 h-full w-full"
      : "pointer-events-none fixed inset-0 z-[-10] h-dvh w-screen";

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}
