const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { applyAccessSnapshot, provisionAccess, NOTE_MAPPINGS, ACCESS_OBSERVER } = require('../lib/automations/access');
const { handleLegacyIngest, parseLegacyBody, inspectLegacyIdentity } = require('../lib/automations/legacyIngest');
const { estimateSavings, summariseObservations } = require('../lib/automations/value');
const { ZAPIER_ONBOARDING } = require('../lib/automations/coverage');
const { openAppStore } = require('../lib/store/index');

const CLIENTS = ['aa-surveys', 'harewood-surveyors', 'house-to-home', 'interim-digital', 'perfit-fitness', 'temple-brown'];

function snapshot() {
  return [
    { id: '19520945', label: 'Personal Account' },
    { id: '293973', label: 'kevin wiles' },
    { id: '13456857', label: 'Personal Account' },
  ];
}

test('selectable accounts stay unverified and only a note-backed client slug joins', () => {
  const first = applyAccessSnapshot({ observed: snapshot(), knownClientSlugs: CLIENTS, seenAt: '2026-11-08T13:35:00Z' });
  const again = applyAccessSnapshot({ records: first.records, observed: snapshot(), knownClientSlugs: CLIENTS, seenAt: '2026-11-08T13:40:00Z' });
  assert.deepEqual(again.created, []);
  assert.equal(again.records.length, 3);
  const aa = again.records.find((row) => row.zapierAccountId === '19520945');
  const kev = again.records.find((row) => row.zapierAccountId === '293973');
  const other = again.records.find((row) => row.zapierAccountId === '13456857');
  assert.equal(aa.access, 'access_detected');
  assert.equal(aa.role, 'role_unverified');
  assert.equal(aa.clientSlug, 'aa-surveys');
  assert.equal(aa.joinedExistingClient, true);
  assert.equal(aa.labelUsedForIdentity, false);
  assert.equal(aa.solutionsPartnerClient, false);
  assert.equal(aa.reporting, 'unmonitored');
  assert.equal(kev.clientSlug, null);
  assert.equal(kev.joinedExistingClient, false);
  assert.equal(kev.noteName, 'Kev');
  assert.equal(other.identity, 'identity_unverified');
  assert.equal(other.joinedExistingClient, false);
  assert.equal(NOTE_MAPPINGS.every((item) => item.registryBound === false), true);
  assert.equal(ACCESS_OBSERVER.connected, false);
  assert.equal(ZAPIER_ONBOARDING.solutionsPartner.automaticAccountRegistration, false);
  assert.equal(ZAPIER_ONBOARDING.listenerInstalled, false);
});

test('a disappeared account is marked missing and its record stays', () => {
  const first = applyAccessSnapshot({ observed: snapshot(), knownClientSlugs: CLIENTS });
  const next = applyAccessSnapshot({
    records: first.records,
    observed: [{ id: '19520945', label: 'Personal Account' }],
    knownClientSlugs: CLIENTS,
    seenAt: '2026-11-09T00:00:00Z',
  });
  const kev = next.records.find((row) => row.zapierAccountId === '293973');
  assert.equal(kev.access, 'access_missing');
  assert.equal(kev.missingAt, '2026-11-09T00:00:00Z');
  assert.equal(next.records.length, 3);
});

test('the runtime does not poll Zapier or write access records until an observer is connected', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'toki-access-'));
  const env = {
    APP_STORE: 'file',
    APP_STORE_PATH: path.join(directory, 'store.enc'),
    APP_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString('base64'),
    NODE_ENV: 'test',
  };
  const opened = openAppStore(env);
  const refused = provisionAccess(opened.store, snapshot());
  assert.equal(refused.ok, false);
  assert.equal(refused.error, 'observer_not_connected');
  assert.equal(opened.store.listAccess().length, 0);
  const allowed = provisionAccess(opened.store, snapshot(), { observerConnected: true, knownClientSlugs: CLIENTS, seenAt: '2026-11-08T13:35:00Z' });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.automatic, false);
  assert.equal(opened.store.listAccess().length, 3);
});

test('legacy zap, zap_id and ts posts are not deduped and optional run ids do not create savings', async () => {
  const inserts = [];
  const db = { from() { return { insert(row) { inserts.push(row); return { error: null }; } }; } };
  const body = { zap: 'Example', zap_id: '99', ts: '2026-11-01T00:00:00Z', run_id: 'run-1', account_id: '19520945' };
  const first = await handleLegacyIngest({ account: 'aa-surveys', secret: 's', configuredSecret: 's', body, db });
  const second = await handleLegacyIngest({ account: 'aa-surveys', secret: 's', configuredSecret: 's', body, db });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(inserts.length, 2);
  assert.equal(first.body.ok, true);
  assert.equal(first.body.run_id, undefined);
  const seen = inspectLegacyIdentity(parseLegacyBody(JSON.stringify(body), 'application/json'));
  assert.equal(seen.dedupe, false);
  assert.equal(seen.savingsClaim, false);
  const summary = summariseObservations([{ eventId: 'a', zapId: '99' }, { eventId: 'b', zapId: '99' }]);
  assert.equal(estimateSavings(summary).withheld, true);
});
