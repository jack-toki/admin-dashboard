const test = require('node:test');
const assert = require('node:assert/strict');
const { summariseRuns, loadRunSummary } = require('../lib/automations/publicRuns');
const { signSession, cookieName } = require('../lib/auth');
const { GET } = require('../app/api/cockpit/automations/route');

test('run posts are counted without dedupe and the estimate stays labelled', async () => {
  const summary = summariseRuns([
    { account: 'aa-surveys', zap_id: '9', zap_title: 'One', ts: '2026-11-08T12:00:00Z', counts: { secret: 'hide' } },
    { account: 'aa-surveys', zap_id: '9', zap_title: 'One', ts: '2026-11-08T13:00:00Z', counts: { secret: 'hide' } },
    { account: 'jack', zap_id: '4', zap_title: 'Own', ts: '2026-11-01T12:00:00Z', counts: {} },
  ]);
  assert.equal(summary.deduped, false);
  assert.equal(summary.posts, 3);
  assert.equal(summary.accountRows.find((row) => row.slug === 'aa-surveys').runs, 2);
  assert.equal(summary.accountRows.find((row) => row.slug === 'aa-surveys').automations, 1);
  assert.equal(summary.accountRows.find((row) => row.slug === 'jack').name, 'Jack');
  assert.equal(summary.estimate.measured, false);
  assert.match(summary.estimate.label, /Estimated/);
  assert.equal(summary.registry.jackReportingInExport, 0);
  assert.equal(summary.registry.jackOwnOn, 43);
  assert.match(summary.registry.note, /not a failure/);
  assert.equal(JSON.stringify(summary).includes('hide'), false);

  const loaded = await loadRunSummary(async () => ({ data: [{ account: 'house-to-home', zap_id: '1', ts: '2026-11-02T00:00:00Z' }], error: null }));
  assert.equal(loaded.ok, true);
  assert.equal(loaded.summary.accountRows[0].name, 'House To Home');
  assert.equal(loaded.summary.posts, 1);

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
