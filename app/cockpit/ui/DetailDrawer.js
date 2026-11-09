'use client';

import { useEffect } from 'react';

export function DetailDrawer({ title, onClose, children }) {
  useEffect(() => {
    const root = document.querySelector('.jrl-root');
    if (!root) return undefined;
    if (title) root.dataset.panel = 'open';
    else delete root.dataset.panel;
    return () => { delete root.dataset.panel; };
  }, [title]);

  if (!title) return null;
  return (
    <div className="drawer-back">
      <aside className="drawer card" role="dialog" aria-modal="false" aria-label={title}>
        <header className="drawer-head">
          <h2>{title}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}

export function DetailFields({ fields }) {
  return (
    <dl className="detail-fields">
      {(fields || []).map((field) => (
        <div key={field.label}>
          <dt>{field.label}</dt>
          <dd>{field.value == null || field.value === '' ? 'Missing' : field.value}</dd>
        </div>
      ))}
    </dl>
  );
}
