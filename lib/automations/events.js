const CONTRACT = 'toki.automation.event.v1';

export function validateEvent(input) {
  const errors = [];
  if (input?.contract !== CONTRACT) errors.push('contract');
  if (!String(input?.accountSlug || '').trim()) errors.push('accountSlug');
  if (!String(input?.zapId || '').trim()) errors.push('zapId');
  if (!String(input?.eventId || '').trim()) errors.push('eventId');
  if (!['success', 'failure'].includes(input?.status)) errors.push('status');
  const attempt = Number(input?.attempt ?? 1);
  if (!Number.isInteger(attempt) || attempt < 1) errors.push('attempt');
  return { ok: errors.length === 0, errors, contract: CONTRACT };
}

export function acceptEvent(store, input) {
  const valid = validateEvent(input);
  if (!valid.ok) return { ok: false, errors: valid.errors };
  const eventId = String(input.eventId);
  const existing = store.get(eventId);
  if (existing) return { ok: true, deduped: true, event: existing };
  const event = {
    contract: CONTRACT,
    accountSlug: String(input.accountSlug).trim(),
    zapId: String(input.zapId).trim(),
    zapTitle: input.zapTitle ? String(input.zapTitle) : null,
    runId: input.runId ? String(input.runId) : null,
    eventId,
    stageId: input.stageId ? String(input.stageId) : null,
    attempt: Number(input.attempt ?? 1),
    status: input.status,
    occurredAt: input.occurredAt || null,
  };
  store.set(eventId, event);
  return { ok: true, deduped: false, event };
}

export function createMemoryStore(seed = []) {
  const map = new Map(seed.map((event) => [event.eventId, event]));
  return {
    get: (id) => map.get(id) || null,
    set: (id, event) => map.set(id, event),
    all: () => [...map.values()],
  };
}
