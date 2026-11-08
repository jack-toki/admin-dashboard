// Account and event registration for the existing ingest path.
// Automatic discovery is not available: no Solutions Partner listener is connected.

export const EVENT_CONTRACT = 'toki.automation.event.v1';

export const READINESS = {
  notRegistered: 'not_registered',
  awaitingEvents: 'registered_awaiting_events',
  receiving: 'receiving',
};

const STORED_EVENT_KEYS = ['contract', 'accountSlug', 'zapId', 'runId', 'eventId', 'stageId', 'attempt', 'status', 'occurredAt'];

export function resolveTenant(matches, bodyAccount) {
  const list = matches || [];
  if (!list.length) return { ok: false, error: 'zap_not_registered', readiness: READINESS.notRegistered };
  const claimed = String(bodyAccount || '').trim();
  if (claimed) {
    const hit = list.find((item) => item.accountSlug === claimed);
    if (!hit) return { ok: false, error: 'tenant_mismatch' };
    return { ok: true, accountSlug: hit.accountSlug, zapId: hit.zapId };
  }
  if (list.length !== 1) return { ok: false, error: 'tenant_ambiguous' };
  return { ok: true, accountSlug: list[0].accountSlug, zapId: list[0].zapId };
}

export function minimalEvent(input, accountSlug) {
  const event = {
    contract: EVENT_CONTRACT,
    accountSlug,
    zapId: String(input.zapId).trim(),
    runId: input.runId ? String(input.runId) : null,
    eventId: String(input.eventId).trim(),
    stageId: input.stageId ? String(input.stageId) : null,
    attempt: Number(input.attempt ?? 1),
    status: input.status,
    occurredAt: input.occurredAt || null,
  };
  return Object.fromEntries(STORED_EVENT_KEYS.map((key) => [key, event[key]]));
}

export function readinessFor(workflow, events) {
  if (!workflow) return READINESS.notRegistered;
  const seen = (events || []).some((event) => event.zapId === workflow.zapId && event.accountSlug === workflow.accountSlug);
  return seen ? READINESS.receiving : READINESS.awaitingEvents;
}
