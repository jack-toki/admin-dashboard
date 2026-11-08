export function validateRegistration(input) {
  const errors = [];
  if (!String(input?.accountSlug || '').trim()) errors.push('accountSlug');
  if (!String(input?.zapId || '').trim()) errors.push('zapId');
  if (!String(input?.title || '').trim()) errors.push('title');
  return { ok: errors.length === 0, errors };
}

export function registerWorkflow(store, input) {
  const valid = validateRegistration(input);
  if (!valid.ok) return { ok: false, errors: valid.errors };
  const key = `${String(input.accountSlug).trim()}::${String(input.zapId).trim()}`;
  const existing = store.get(key);
  const record = {
    key,
    accountSlug: String(input.accountSlug).trim(),
    accountName: input.accountName ? String(input.accountName) : null,
    client: input.client ? String(input.client) : null,
    owner: input.owner ? String(input.owner) : null,
    zapId: String(input.zapId).trim(),
    title: String(input.title).trim(),
    source: 'authenticated_registration',
    zapierListener: false,
  };
  if (existing) return { ok: true, created: false, record: existing };
  store.set(key, record);
  return { ok: true, created: true, record };
}

export function healthFor(workflow, events, now = Date.now(), staleMs = 14 * 86400000) {
  const related = (events || []).filter((event) => event.zapId === workflow.zapId && event.accountSlug === workflow.accountSlug);
  if (!related.length) return { state: 'no_events', failed: false, note: 'No event is not a failure.' };
  const latest = [...related].sort((a, b) => String(a.occurredAt || '').localeCompare(String(b.occurredAt || ''))).at(-1);
  const when = latest.occurredAt ? Date.parse(latest.occurredAt) : NaN;
  if (Number.isFinite(when) && now - when > staleMs) {
    return { state: 'stale_observation', failed: false, lastStatus: latest.status };
  }
  if (latest.status === 'failure') return { state: 'last_event_failed', failed: true, lastStatus: 'failure' };
  return { state: 'last_event_succeeded', failed: false, lastStatus: 'success' };
}
