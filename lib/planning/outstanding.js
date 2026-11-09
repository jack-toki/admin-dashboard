const TITLE = /^.{1,200}$/;

export function validateOutstanding(input) {
  const title = String(input?.title || '').replace(/\s+/g, ' ').trim();
  if (!TITLE.test(title)) return { ok: false, errors: ['title'] };
  const id = input?.id ? String(input.id) : `todo_${Math.random().toString(36).slice(2, 10)}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9:._-]{0,79}$/.test(id)) return { ok: false, errors: ['id'] };
  return { ok: true, item: { id, title, doneAt: null } };
}

export function outstandingFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    doneAt: row.done_at || row.doneAt || null,
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  };
}
