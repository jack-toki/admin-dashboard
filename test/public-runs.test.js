const test = require('node:test');
const assert = require('node:assert/strict');
const { summariseRuns, loadRunSummary, identifyRunAccount } = require('../lib/automations/publicRuns');
const { signSession, cookieName } = require('../lib/auth');
const { GET } = require('../app/api/cockpit/automations/route');

test('run posts are counted without dedupe and the estimate stays labelled', async () => {
  const summary = summariseRuns([
    { account: 'aa-surveys', zap_id: '9', zap_title: 'Send invoice', ts: '2026-11-08T12:00:00Z', counts: { secret: 'hide' } },
    { account: 'aa-surveys', zap_id: '9', zap_title: 'Send invoice', ts: '2026-11-08T13:00:00Z', counts: { secret: 'hide' } },
    { account: 'jack', zap_id: '4', zap_title: 'Send email', ts: '2026-11-01T12:00:00Z', counts: {} },
  ]);
  assert.equal(summary.deduped, false);
  assert.equal(summary.posts, 3);
  assert.equal(summary.accountRows.find((row) => row.logAccount === 'aa-surveys').runs, 2);
  assert.equal(summary.accountRows.find((row) => row.logAccount === 'aa-surveys').reportingZapIds, 1);
  assert.equal(summary.accountRows.find((row) => row.logAccount === 'aa-surveys').ingestSlug, null);
  assert.equal(summary.accountRows.find((row) => row.logAccount === 'jack').name, 'jack');
  assert.equal(summary.reportingZapIds, 2);
  assert.equal(summary.estimate.measured, false);
  assert.equal(summary.estimate.basis, 'per_zap');
  assert.equal(summary.estimate.value, 13);
  assert.doesNotMatch(summary.estimate.label, /per logged post/);
  assert.equal(summary.registry.jackReportingInExport, 0);
  assert.equal(summary.registry.jackOwnOn, 43);
  assert.match(summary.registry.note, /not a failure/);
  assert.equal(JSON.stringify(summary).includes('hide'), false);

  const loaded = await loadRunSummary(async () => ({ data: [{ account: 'house-to-home', zap_id: '1', ts: '2026-11-02T00:00:00Z' }], error: null }));
  assert.equal(loaded.ok, true);
  assert.equal(loaded.summary.accountRows[0].name, 'house-to-home');
  assert.equal(loaded.summary.accountRows[0].ingestSlug, null);
  assert.equal(loaded.summary.posts, 1);
  const named = summariseRuns([
    { account: 'House to Home Surveys', zap_id: '1', ts: '2026-11-08T12:00:00Z' },
    { account: 'House to Home Surveys', zap_id: '', ts: '2026-11-08T12:05:00Z' },
    { account: 'house-to-home', zap_id: '2', ts: '2026-11-08T12:06:00Z' },
  ], undefined, { ACCOUNTS: '{"house-to-home":"House to Home Surveys"}' });
  assert.equal(named.accountRows.find((row) => row.logAccount === 'House to Home Surveys').ingestSlug, 'house-to-home');
  assert.equal(named.accountRows.find((row) => row.logAccount === 'House to Home Surveys').reportingZapIds, 1);
  assert.equal(named.accountRows.find((row) => row.logAccount === 'House to Home Surveys').postsWithoutZapId, 1);
  assert.equal(named.accountRows.find((row) => row.logAccount === 'house-to-home').name, 'House to Home Surveys');
  assert.equal(named.reportingZapIds, 2);
  assert.equal(named.postsWithoutZapId, 1);
  assert.equal(named.estimate.value, 12);
  const rated = summariseRuns([
    { account: 'Northwind', zap_id: 'invoice', zap_title: 'Send invoice', ts: '2026-11-08T12:00:00Z' },
  ], undefined, {}, [{ id: 'zap:invoice', minutesPerRun: 9 }, { id: 'client:Northwind', hourlyRateMinor: 6000 }]);
  assert.equal(rated.estimate.value, 9);
  assert.equal(identifyRunAccount('Interim Digital', { ACCOUNTS: '{}' }).ingestSlug, null);

  const previous = process.env.DASHBOARD_SESSION_SECRET;
  process.env.DASHBOARD_SESSION_SECRET = 'session-secret-for-test';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_KEY;
  try {
    const closed = await GET(new Request('http://localhost/api/cockpit/automations'));
    assert.equal(closed.status, 401);
    const token = signSession({ role: 'admin', areas: ['automations', 'toki', 'jrl'] });
    const missing = await GET(new Request('http://localhost/api/cockpit/automations', { headers: { cookie: `${cookieName()}=${token}` } }));
    assert.equal(missing.status, 503);
    const body = await missing.json();
    assert.equal(body.summary, null);
  } finally {
    if (previous == null) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previous;
  }
});
