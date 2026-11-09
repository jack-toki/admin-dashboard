'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { placeTooltip } from '../../../lib/cockpit/placeTooltip';

export function cursorPoint(event) {
  const target = event?.currentTarget;
  const rect = target?.getBoundingClientRect?.();
  if (!event || event.type === 'focus' || !Number.isFinite(event.clientX)) {
    if (!rect) return { clientX: 0, clientY: 0 };
    return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  }
  return { clientX: event.clientX, clientY: event.clientY };
}

export function usePlacedTooltip(hostRef, cursor) {
  const tipRef = useRef(null);
  const [pos, setPos] = useState({ left: 12, top: 12 });
  useLayoutEffect(() => {
    const host = hostRef.current;
    const tip = tipRef.current;
    if (!host || !tip || !cursor) return undefined;
    const box = host.getBoundingClientRect();
    setPos(placeTooltip({
      cursorX: cursor.clientX,
      cursorY: cursor.clientY,
      hostLeft: box.left,
      hostTop: box.top,
      hostWidth: box.width,
      hostHeight: box.height,
      tipWidth: tip.offsetWidth,
      tipHeight: tip.offsetHeight,
    }));
    return undefined;
  }, [cursor, hostRef]);
  return { tipRef, style: { left: pos.left, top: pos.top } };
}

export function CursorTooltip({ text, cursor, hostRef, className, id, role = 'tooltip' }) {
  const { tipRef, style } = usePlacedTooltip(hostRef, cursor);
  const lines = String(text || '').split('\n');
  return (
    <div ref={tipRef} id={id} role={role} className={className} style={style}>
      {lines.map((line, index) => <div key={`${index}-${line}`}>{line}</div>)}
    </div>
  );
}
