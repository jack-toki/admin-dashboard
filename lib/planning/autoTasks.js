function monthShift(period, delta) {
  if (!/^\d{4}-\d{2}$/.test(period || '')) return null;
  const date = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)) - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function deriveAutoTasks({
  period,
  cells = [],
  details = [],
  entries = [],
  posts = null,
  potsUpdated = true,
  dismissals = [],
} = {}) {
  const tasks = [];
  const previous = monthShift(period, -1);
  const dismissed = new Set((dismissals || []).map((row) => row.id || `${row.taskKey}:${row.period}`));

  function add(key, title, href) {
    const id = `${key}:${period}`;
    if (dismissed.has(id)) return;
    tasks.push({ id, taskKey: key, title, href, period, source: 'auto' });
  }

  const missing = (cells || []).filter((cell) => cell.month === period && (cell.nullState === 'blank' || cell.enteredMinor == null && cell.amountMinor == null) && cell.kind !== 'metric');
  if (missing.length) add('sheet-gaps', `${missing.length} forecast input${missing.length === 1 ? '' : 's'} missing in ${period}`, '/cockpit#toki');

  const openRetainers = (details || []).filter((row) => row.kind === 'retainer' && !row.deletedAt && !row.contractEndDate && !row.contractEndUnknown);
  if (openRetainers.length) add('retainer-end', `${openRetainers.length} retainer${openRetainers.length === 1 ? '' : 's'} missing a contract end`, '/cockpit#sources');

  if (previous && !(entries || []).some((row) => String(row.period || '').startsWith(previous))) {
    add('jrl-month', `JRL ledger has no ${previous} entry`, '/cockpit#jrl');
  }

  if (posts === 0) add('automations-silent', `No automation posts in ${period}`, '/cockpit#automations');

  if (potsUpdated === false) add('pots-stale', 'Money pots have not been updated', '/cockpit#jrl');

  return tasks;
}
