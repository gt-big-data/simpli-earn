// Shared timing for the dashboard's panel animations (chat expand/collapse, summary/chat split),
// so every moving panel uses the same duration and easing
export const MOTION_MS = 300;
export const MOTION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

export const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
