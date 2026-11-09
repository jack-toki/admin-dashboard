export const TOOLTIP_OFFSET = 12;

// Viewport coordinates, not the chart box. A tip taller than its plot can
// still sit by the cursor. Overflow flips to the other side; the width stays.
export function placeTooltip({
  cursorX,
  cursorY,
  viewportWidth,
  viewportHeight,
  tipWidth,
  tipHeight,
  offset = TOOLTIP_OFFSET,
} = {}) {
  const width = Math.max(0, Number(tipWidth) || 0);
  const height = Math.max(0, Number(tipHeight) || 0);
  const viewW = Math.max(0, Number(viewportWidth) || 0);
  const viewH = Math.max(0, Number(viewportHeight) || 0);
  let left = cursorX + offset;
  let top = cursorY + offset;
  let flippedX = false;
  let flippedY = false;
  if (left + width > viewW) {
    left = cursorX - offset - width;
    flippedX = true;
  }
  if (top + height > viewH) {
    top = cursorY - offset - height;
    flippedY = true;
  }
  if (left < 0) left = 0;
  if (top < 0) top = 0;
  return { left, top, flippedX, flippedY, width, height };
}

// SVG text in px is scaled by the viewBox. Divide by that scale so the
// glyphs stay at targetPx on screen.
export function svgAxisFont(targetPx, viewBoxWidth, renderedWidth) {
  const rendered = Number(renderedWidth) || 0;
  const view = Number(viewBoxWidth) || 0;
  if (!rendered || !view) return targetPx;
  return (targetPx * view) / rendered;
}
