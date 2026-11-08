const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { GROUPS } = require('../lib/groups');
const { syntheticActuals, syntheticBaseline, syntheticPipeline } = require('../lib/fixtures/synthetic');
const { compareGroup, overview, withScenario, recurringCostMonths, pipelineRow, reviewActivity, weeklyCommentary } = require('../lib/finance/screen');
const { validateEntry } = require('../lib/planning/entries');
const { openAppStore } = require('../lib/store/index');
const { encryptToken, decryptToken } = require('../lib/xero/oauth');
const { signSession, cookieName } = require('../lib/auth');
const { boardExport } = require('../lib/workspace/cockpit');
const { createSourceBundle } = require('../lib/sources/bundle');
const { selectBaseline } = require('../lib/pnl/parseFirstTab');
const { finishOAuth } = require('../lib/oauth/finish');
const { planGet, planPost, workspaceGet, jrlGet, registerPost, eventsPost } = require('../lib/cockpit/http');

function group(id) {
  return GROUPS.find((item) => item.id === id);
}

test('variance keeps a missing group and a partial actual unknown', () => {
  const model = syntheticBaseline();
  const actuals = syntheticActuals();
  const finance = compareGroup({ rows: model.rows, actuals, group: group('finance'), month: '2026-01' });
  assert.equal(finance.forecast.reason, 'no_forecast_lines');
  assert.equal(finance.rawDifference, null);
  assert.equal(finance.judgement, 'unknown');

  const people = compareGroup({ rows: model.rows, actuals, group: group('people'), month: '2026-01' });
  assert.equal(people.forecast.minor, 3000);
  assert.equal(people.actual.known, false);
  assert.equal(people.rawDifference, null);
  assert.equal(people.judgement, 'unknown');

  const august = compareGroup({ rows: model.rows, actuals, group: group('billing'), month: '2026-08' });
  assert.equal(august.actual.coverage, 'partial');
  assert.equal(august.actual.known, false);
  assert.equal(august.judgement, 'unknown');
  assert.equal(august.definitive, false);
});

test('a repeating cost covers the stated months only', () => {
  const entry = validateEntry({
    kind: 'cost',
    amountMinor: 2500,
    currency: 'GBP',
    month: '2026-11',
    party: 'Example vendor',
    groupId: 'administration',
    timing: 'recurring',
    durationMonths: 3,
  }).entry;
  assert.deepEqual(recurringCostMonths(entry), ['2026-11', '2026-12', '2027-01']);
});

test('a what-if recomputes a copy and leaves the baseline rows unchanged', () => {
  const model = syntheticBaseline();
  const before = JSON.stringify(model.rows);
  const copy = withScenario(model.rows, 'best');
  assert.equal(JSON.stringify(model.rows), before);
  const base = overview(model, syntheticActuals(), '2026-01').resultMinor;
  const best = overview({ rows: copy, months: model.months }, syntheticActuals(), '2026-01').resultMinor;
  assert.notEqual(best, base);
  assert.ok(best > base);
});

test('pipeline probability stays unknown and a contact without history is not new', () => {
  const deal = pipelineRow(syntheticPipeline()[0]);
  assert.equal(deal.probabilityKnown, false);
  assert.equal(deal.probability, null);
  assert.equal(deal.weightedMinor, null);
  assert.equal(deal.inFinancialPlan, false);
  const reviewed = reviewActivity([
    { leadId: 'lead-a', label: 'Ada', email: 'ada@example.com', evidence: 'none', priorKnowledge: 'unknown', historyComplete: false },
    { leadId: 'lead-b', label: 'Ada again', email: 'ada@example.com', evidence: 'calendar', priorKnowledge: 'unknown', historyComplete: false },
  ]);
  assert.equal(reviewed[0].classification, 'needs_review');
  assert.deepEqual(reviewed[0].sameAs, ['lead-b']);
  assert.equal(weeklyCommentary([{ text: 'No evidence', evidence: '' }, { text: 'Noted', evidence: 'lead-a' }]).length, 1);
});

test('manual plan reload, registry upsert, event retry, and token encryption use an injected file store', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'toki-store-'));
  const env = {
    APP_STORE: 'file',
    APP_STORE_PATH: path.join(directory, 'store.enc'),
    APP_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    NODE_ENV: 'test',
    DASHBOARD_SESSION_SECRET: 'session-secret-for-test',
    INGEST_SECRET: 'ingest-secret-for-test',
  };
  const previous = {
    DASHBOARD_SESSION_SECRET: process.env.DASHBOARD_SESSION_SECRET,
    INGEST_SECRET: process.env.INGEST_SECRET,
  };
  process.env.DASHBOARD_SESSION_SECRET = env.DASHBOARD_SESSION_SECRET;
  process.env.INGEST_SECRET = env.INGEST_SECRET;
  try {
    const admin = signSession({ role: 'admin', areas: ['toki', 'automations', 'jrl'] }, env);
    const cookie = `${cookieName()}=${admin}`;
    const saved = await planPost(new Request('http://localhost/api/cockpit/plan', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'sale', amount: 25, currency: 'GBP', month: '2026-03', party: 'Example client', groupId: 'billing', timing: 'one_off' }),
    }), { env });
    assert.equal(saved.status, 201);
    const reloaded = await planGet(new Request('http://localhost/api/cockpit/plan', { headers: { cookie } }), { env });
    const body = await reloaded.json();
    assert.equal(body.entries.length, 1);
    assert.equal(body.entries[0].amountMinor, 2500);
    assert.equal(body.shared, false);
    const again = openAppStore(env);
    assert.equal((await again.store.listPlans()).length, 1);

    const first = await registerPost(new Request('http://localhost/api/automations/register', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ accountSlug: 'example-client', zapId: 'zap-1', title: 'Example' }),
    }), { env });
    const second = await registerPost(new Request('http://localhost/api/automations/register', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ accountSlug: 'example-client', zapId: 'zap-1', title: 'Changed title' }),
    }), { env });
    assert.equal((await first.json()).created, true);
    assert.equal((await second.json()).created, false);

    const event = {
      contract: 'toki.automation.event.v1',
      accountSlug: 'example-client',
      zapId: 'zap-1',
      eventId: 'event-1',
      status: 'success',
      attempt: 1,
    };
    const posted = await eventsPost(new Request('http://localhost/api/automations/events', {
      method: 'POST',
      headers: { 'x-toki-secret': env.INGEST_SECRET, 'content-type': 'application/json' },
      body: JSON.stringify(event),
    }), { env });
    const retried = await eventsPost(new Request('http://localhost/api/automations/events', {
      method: 'POST',
      headers: { 'x-toki-secret': env.INGEST_SECRET, 'content-type': 'application/json' },
      body: JSON.stringify(event),
    }), { env });
    assert.equal((await posted.json()).deduped, false);
    assert.equal((await retried.json()).deduped, true);

    const token = { refresh_token: 'refresh-secret', access_token: 'access-secret' };
    const enc = encryptToken(token, env);
    assert.equal(enc.ok, true);
    assert.equal(enc.ciphertext.includes('refresh-secret'), false);
    await again.store.saveToken({ provider: 'xero', tenantKey: 'example', payload: token });
    const stored = decryptToken(fs.readFileSync(env.APP_STORE_PATH, 'utf8'), env);
    assert.equal(stored.ok, true);
    assert.equal(stored.payload.tokens[0].ciphertext.includes('refresh-secret'), false);
    const round = decryptToken(stored.payload.tokens[0].ciphertext, env);
    assert.equal(round.ok, true);
    assert.equal(round.payload.refresh_token, 'refresh-secret');
  } finally {
    if (previous.DASHBOARD_SESSION_SECRET == null) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previous.DASHBOARD_SESSION_SECRET;
    if (previous.INGEST_SECRET == null) delete process.env.INGEST_SECRET;
    else process.env.INGEST_SECRET = previous.INGEST_SECRET;
  }
});

test('auth and personal export stay isolated from a client session', async () => {
  const previous = process.env.DASHBOARD_SESSION_SECRET;
  process.env.DASHBOARD_SESSION_SECRET = 'session-secret-for-test';
  try {
    const admin = signSession({ role: 'admin', areas: ['toki', 'automations', 'jrl'] });
    const client = signSession({ role: 'client', areas: ['automations'], client: 'Example Client' });
    const open = await workspaceGet(new Request('http://localhost/api/cockpit/workspace'));
    assert.equal(open.status, 401);
    const clientWorkspace = await workspaceGet(new Request('http://localhost/api/cockpit/workspace', {
      headers: { cookie: `${cookieName()}=${client}` },
    }));
    const workspace = await clientWorkspace.json();
    assert.equal(clientWorkspace.status, 200);
    assert.equal(workspace.xero.state, 'hidden');
    assert.equal(workspace.sheets.state, 'hidden');
    assert.equal(workspace.jrlIncluded, false);
    assert.equal(Object.hasOwn(workspace, 'jrl'), false);
    const personal = await jrlGet(new Request('http://localhost/api/cockpit/jrl', {
      headers: { cookie: `${cookieName()}=${client}` },
    }));
    assert.equal(personal.status, 403);
    const plan = await planGet(new Request('http://localhost/api/cockpit/plan', {
      headers: { cookie: `${cookieName()}=${client}` },
    }));
    assert.equal(plan.status, 403);
    const own = await jrlGet(new Request('http://localhost/api/cockpit/jrl', {
      headers: { cookie: `${cookieName()}=${admin}` },
    }));
    assert.equal(own.status, 200);
    assert.equal((await own.json()).entries.length, 0);
    const board = boardExport({ forecast: { minor: 1 }, jrl: { balance: 5 }, personal: { name: 'hidden' } });
    assert.equal(board.body.jrl, undefined);
    assert.equal(board.body.personal, undefined);
  } finally {
    if (previous == null) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previous;
  }
});

test('an injected reader supplies a forecast and the default bundle does not call the network', async () => {
  let network = false;
  const bundle = createSourceBundle();
  const closed = await bundle.forecast('not-a-real-sheet');
  assert.equal(closed.error, 'sheets_not_connected');
  assert.equal(closed.calledNetwork, false);
  const live = createSourceBundle({
    sheets: {
      async readWorkbook() {
        network = true;
        return {
          ok: true,
          sheets: [{
            title: 'Forecast Profit & Loss',
            sheetId: 1455407915,
            grid: [
              ['', 'January', 'February'],
              ['Billing'],
              ['Retained Clients', '10', '0'],
            ],
          }],
        };
      },
    },
  });
  const read = await live.forecast('example');
  const chosen = selectBaseline(read.sheets);
  assert.equal(network, true);
  assert.equal(chosen.baseline.rows.find((row) => row.label === 'Retained Clients').cells['2026-01'].minor, 1000);
  const saved = {};
  const oauth = await finishOAuth({
    store: {
      async consumeNonce() { return true; },
      async saveToken(row) { saved.row = row; },
    },
    nonce: 'once',
    provider: 'xero',
    code: 'example-code',
    exchange: async () => ({ access_token: 'a', refresh_token: 'r', tenantKey: 'tenant' }),
  });
  assert.equal(oauth.status, 200);
  assert.equal(saved.row.payload.refresh_token, 'r');
  const reused = await finishOAuth({
    store: { async consumeNonce() { return false; }, async saveToken() { throw new Error('should not save'); } },
    nonce: 'once',
    provider: 'xero',
    code: 'example-code',
    exchange: async () => ({ access_token: 'a' }),
  });
  assert.equal(reused.status, 400);
});

test('the app store SQL check passes and apply refuses without a local disposable database', () => {
  const check = spawnSync(process.execPath, ['scripts/migrate-app-store.js', '--check'], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
  const apply = spawnSync(process.execPath, ['scripts/migrate-app-store.js', '--apply'], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  assert.equal(apply.status, 2);
});
