'use client';

export function DetailDrawer({ title, onClose, children }) {
  if (!title) return null;
  return (
    <div className="drawer-back" role="presentation" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
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
