export function clampProgress(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

export function stepAt(progress, count = 4) {
  return Math.min(count - 1, Math.floor(clampProgress(progress) * count));
}

export function scrollProgress(firstTop, lastBottom, viewportHeight, mobile = false) {
  const anchor = viewportHeight * (mobile ? 0.82 : 0.56);
  return clampProgress((anchor - firstTop) / Math.max(1, lastBottom - firstTop));
}
