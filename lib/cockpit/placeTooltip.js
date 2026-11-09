export const TOOLTIP_OFFSET = 12;

// Position a tooltip by the cursor. The tip keeps its measured size.
// When that size would cross the host edge, the tip flips to the other side.
export function placeTooltip({
  cursorX,
  cursorY,
  hostLeft,
  hostTop,
  hostWidth,
  hostHeight,
  tipWidth,
  tipHeight,
  offset = TOOLTIP_OFFSET,
} = {}) {
  const width = Math.max(0, Number(tipWidth) || 0);
  const height = Math.max(0, Number(tipHeight) || 0);
  const localX = cursorX - hostLeft;
  const localY = cursorY - hostTop;
  let left = localX + offset;
  let top = localY + offset;
  let flippedX = false;
  let flippedY = false;
  if (left + width > hostWidth) {
    left = localX - offset - width;
    flippedX = true;
  }
  if (top + height > hostHeight) {
    top = localY - offset - height;
    flippedY = true;
  }
  if (left < 0) left = 0;
  if (top < 0) top = 0;
  return { left, top, flippedX, flippedY, width, height };
}
