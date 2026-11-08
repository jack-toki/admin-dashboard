// Access snapshot adapter. The app does not call Zapier.
// A selectable account id is access_detected only. It is not a role, a grant time,
// or proof that the account is a Solutions Partner client.

export const ACCESS_OBSERVER = {
  connected: false,
  scheduled: false,
  callsConnector: false,
  route: 'scheduled_native_connector_read_plus_snapshot_diff',
  pending: 'Nothing is scheduled. The observer is wired later, when the durable registry is ready, and it feeds this adapter a snapshot.',
};

// Prior notes, not a row in automation_registry. The registry has no Zapier account id column.
// 19520945 is labelled "Personal Account" in Zapier. The label is not the binding.
export const NOTE_MAPPINGS = [
  { zapierAccountId: '19520945', noteName: 'AA', clientSlug: 'aa-surveys', source: 'prior_notes', registryBound: false },
  { zapierAccountId: '293973', noteName: 'Kev', clientSlug: null, source: 'prior_notes', registryBound: false },
];

export function applyAccessSnapshot({
  records = [],
  observed = [],
  mappings = NOTE_MAPPINGS,
  knownClientSlugs = [],
  seenAt = null,
} = {}) {
  const byId = new Map((records || []).map((record) => [String(record.zapierAccountId), { ...record, history: [...(record.history || [])] }]));
  const seen = new Set();
  const created = [];
  for (const account of observed || []) {
    const id = String(account.id || '').trim();
    if (!id) continue;
    seen.add(id);
    const mapping = (mappings || []).find((item) => item.zapierAccountId === id);
    const slug = mapping?.clientSlug && (knownClientSlugs || []).includes(mapping.clientSlug) ? mapping.clientSlug : null;
    const existing = byId.get(id);
    const next = {
      zapierAccountId: id,
      labelSnapshot: account.label || null,
      labelUsedForIdentity: false,
      access: 'access_detected',
      role: 'role_unverified',
      identity: slug ? 'confirmed_from_notes' : 'identity_unverified',
      clientSlug: slug,
      joinedExistingClient: Boolean(slug),
      solutionsPartnerClient: false,
      noteName: mapping?.noteName || null,
      reporting: existing?.reporting || 'unmonitored',
      history: existing?.history || [],
      firstSeenAt: existing?.firstSeenAt || seenAt,
      lastSeenAt: seenAt || existing?.lastSeenAt || null,
      missingAt: null,
    };
    if (!existing) created.push(id);
    byId.set(id, next);
  }
  const missing = [];
  for (const [id, record] of byId) {
    if (!seen.has(id) && record.access !== 'access_missing') {
      record.access = 'access_missing';
      record.missingAt = seenAt;
      record.joinedExistingClient = Boolean(record.clientSlug);
      missing.push(id);
      byId.set(id, record);
    }
  }
  return {
    records: [...byId.values()].sort((a, b) => a.zapierAccountId.localeCompare(b.zapierAccountId)),
    created,
    missing,
    observer: ACCESS_OBSERVER,
    automatic: false,
  };
}

export function provisionAccess(store, observed, options = {}) {
  if (!options.observerConnected) {
    return { ok: false, error: 'observer_not_connected', automatic: false, records: store?.listAccess?.() || [], observer: ACCESS_OBSERVER };
  }
  const diff = applyAccessSnapshot({
    records: store.listAccess(),
    observed,
    mappings: options.mappings,
    knownClientSlugs: options.knownClientSlugs,
    seenAt: options.seenAt || null,
  });
  for (const record of diff.records) store.upsertAccess(record);
  return { ok: true, automatic: false, ...diff };
}
