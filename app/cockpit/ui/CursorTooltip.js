'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

export function TooltipPortal({ cursor, className, id, role = 'tooltip', children }) {
  const tipRef = useRef(null);
  const [pos, setPos] = useState({ left: 12, top: 12 });
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!tip || !cursor || typeof window === 'undefined') return undefined;
    setPos(placeTooltip({
      cursorX: cursor.clientX,
      cursorY: cursor.clientY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      tipWidth: tip.offsetWidth,
      tipHeight: tip.offsetHeight,
    }));
    return undefined;
  }, [cursor]);
  if (typeof document === 'undefined') return null;
  const host = document.querySelector('.jrl-root');
  if (!host) return null;
  return createPortal(
    <div ref={tipRef} id={id} role={role} className={`cursor-tip ${className || ''}`} style={{ left: pos.left, top: pos.top }}>
      {children}
    </div>,
    host,
  );
}

export function CursorTooltip({ text, cursor, className, id, role = 'tooltip' }) {
  const lines = String(text || '').split('\n');
  return (
    <TooltipPortal cursor={cursor} className={className} id={id} role={role}>
      {lines.map((line, index) => <div key={`${index}-${line}`}>{line}</div>)}
    </TooltipPortal>
  );
}
