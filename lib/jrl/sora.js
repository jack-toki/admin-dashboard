const PAGE = 30;

export function filterConversations(rows, filter = 'all') {
  const list = rows || [];
  if (filter === 'actions') return list.filter((row) => (row.actions || []).length > 0);
  if (filter === 'alerts') return list.filter((row) => row.trigger === 'alert');
  if (filter === 'failed') return list.filter((row) => (row.actions || []).some((action) => action.ok === false));
  return list;
}

export function pageConversations(rows, cursor = null, limit = PAGE) {
  const sorted = [...(rows || [])].sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
  const visible = cursor ? sorted.filter((row) => String(row.started_at) < String(cursor)) : sorted;
  return {
    page: visible.slice(0, limit),
    next: visible.length > limit ? visible[limit - 1].started_at : null,
  };
}

export function dayGroup(iso, now = new Date()) {
  const date = new Date(iso);
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const diff = Math.round((start - day) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function confirmDelete(confirmed) {
  return confirmed === true ? { ok: true } : { ok: false, error: 'confirm_required' };
}
