const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { deriveLedger, upsertEntry, projectValue, BENCHMARK, ENTRY_FIELDS } = require('../lib/jrl/finance');
const { monthWindow } = require('../lib/jrl/months');
const { monthsToTarget, monthlyForTarget, personalMonthlyPlan } = require('../lib/jrl/targets');
const { advise } = require('../lib/jrl/afford');
const { filterConversations, pageConversations, confirmDelete } = require('../lib/jrl/sora');
const { createJrlReader, jrlAuthGap } = require('../lib/jrl/reader');
const { exampleEntries, exampleTargets } = require('../lib/jrl/example');
const { jrlWrite } = require('../lib/jrl/http');
const { signSession, cookieName } = require('../lib/auth');
const { boardExport } = require('../lib/workspace/cockpit');

test('ledger keeps contributions out of gain and does not invent a missing value', () => {
  const rows = deriveLedger(exampleEntries());
  const august = rows[0];
  const september = rows[1];
  const october = rows[2];
  assert.equal(august.chase_total, august.savings_total + august.tax_total);
  assert.equal(august.net_total, august.chase_total + august.hl_contributed);
  assert.notEqual(august.net_total, august.hl_value);
  assert.equal(august.earned, null);
  assert.equal(august.gain, 1000 - 150);
  assert.equal(september.hl_value, null);
  assert.equal(september.gain, null);
  assert.equal(september.earned, null);
  assert.equal(september.hl_carried, true);
  assert.equal(september.hl_chart_value, 1000);
  assert.equal(october.earned, (1400 - 1000) - 300);
  assert.equal(october.gain, 1400 - 450);
  assert.equal(october.net_total, october.chase_total + october.hl_contributed);
});

test('a month overwrite replaces that period and blank flows are zero', () => {
  const first = upsertEntry([], { period: '2026-10', tax_in: 10, savings_in: '', hl_in: null, savings_out: 0, hl_value: '' });
  assert.equal(first[0].tax_in, 10);
  assert.equal(first[0].savings_in, 0);
  assert.equal(first[0].hl_value, null);
  const next = upsertEntry(first, { period: '2026-10', tax_in: 25, savings_in: 5, hl_in: 0, savings_out: 0, hl_value: 40 });
  assert.equal(next.length, 1);
  assert.equal(next[0].tax_in, 25);
  assert.deepEqual(ENTRY_FIELDS, ['tax_in', 'savings_in', 'hl_in', 'savings_out', 'hl_value']);
});

test('the month window keeps the current off-by-one options', () => {
  const window = monthWindow(new Date('2026-11-08T00:00:00Z'));
  assert.equal(window.defaultPeriod, '2026-10-01');
  assert.equal(window.options[0], '2026-11-01');
  assert.equal(window.options[1], '2026-10-01');
  assert.equal(window.options.length, 24);
});

test('targets compound, and spending ignores business commitments and the emergency floor', () => {
  assert.equal(monthsToTarget({ current: 0, target: 1000, monthly: 100, rate: 0 }), 10);
  const monthly = monthlyForTarget({ current: 0, target: 1000, months: 10, rate: 0 });
  assert.equal(monthly, 100);
  assert.equal(personalMonthlyPlan(exampleTargets()), 200);
  const floor = advise({ amount: 100, budget: 300, emergencyFloor: 50, savingsBalance: 80, savingsFirst: true, targets: exampleTargets() });
  assert.equal(floor.verdict, 'no');
  assert.equal(floor.advice, 'dont');
  const waiting = advise({ amount: 10, budget: 150, spent: 0, emergencyFloor: 0, savingsBalance: 1000, savingsFirst: true, targets: exampleTargets() });
  assert.equal(waiting.personalMonthlyPlan, 200);
  assert.equal(waiting.verdict, 'wait');
  assert.equal(waiting.advice, 'save-first');
  assert.equal(advise({ amount: null, budget: null }).reason, 'needs_budget_and_price');
  assert.equal(BENCHMARK, 0.07);
  assert.equal(projectValue(1000, 0), 1000);
});

test('sora pages and filters without a composer, and delete needs confirmation', () => {
  const rows = [
    { id: 'new', started_at: '2026-11-08T10:00:00Z', trigger: 'wake', actions: [{ ok: true }] },
    { id: 'old', started_at: '2026-11-01T10:00:00Z', trigger: 'alert', actions: [{ ok: false }] },
  ];
  assert.equal(filterConversations(rows, 'alerts').length, 1);
  assert.equal(filterConversations(rows, 'failed')[0].id, 'old');
  const page = pageConversations(rows, null, 1);
  assert.equal(page.page[0].id, 'new');
  assert.equal(page.next, '2026-11-08T10:00:00Z');
  assert.equal(confirmDelete(false).ok, false);
  assert.equal(confirmDelete(true).ok, true);
});

test('the personal reader refuses the service role and the cockpit password does not load balances', async () => {
  assert.throws(() => createJrlReader({ serviceRoleKey: 'secret' }), /jrl_service_role_refused/);
  const gap = jrlAuthGap({});
  assert.equal(gap.supabaseUser, false);
  assert.equal(gap.balances, null);
  assert.equal(gap.serviceRoleUsed, false);
  let seen = null;
  process.env.SUPABASE_SERVICE_KEY = 'service-role-secret';
  const reader = createJrlReader({
    url: 'https://example.supabase.co',
    anonKey: 'anon-key',
    accessToken: 'user-jwt',
    fetchImpl: async (url, init) => {
      seen = { url, init };
      return { ok: true, json: async () => [] };
    },
  });
  const result = await reader.select('monthly_finance');
  assert.equal(result.ok, true);
  assert.equal(seen.init.headers.apikey, 'anon-key');
  assert.equal(seen.init.headers.Authorization, 'Bearer user-jwt');
  assert.equal(JSON.stringify(seen).includes('service-role-secret'), false);
  delete process.env.SUPABASE_SERVICE_KEY;

  const previous = process.env.DASHBOARD_SESSION_SECRET;
  process.env.DASHBOARD_SESSION_SECRET = 'session-secret-for-test';
  try {
    const token = signSession({ role: 'admin', areas: ['jrl', 'toki'] });
    const res = await jrlWrite(new Request('http://localhost/api/cockpit/jrl/month', {
      method: 'POST',
      headers: { cookie: `${cookieName()}=${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ period: '2026-10', tax_in: 1 }),
    }));
    const body = await res.json();
    assert.equal(res.status, 409);
    assert.equal(body.saved, false);
    assert.equal(body.balances, null);
    const board = boardExport({ forecast: { minor: 1 }, jrl: { entries: exampleEntries() }, personal: { name: 'hidden' } });
    assert.equal(board.body.jrl, undefined);
    assert.equal(JSON.stringify(board.body).includes('1000'), false);
  } finally {
    if (previous == null) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previous;
  }
});

test('owner boundary SQL is prepared offline and does not open the ledger to anon', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'jrl_owner_boundary.sql'), 'utf8');
  assert.match(sql, /NOT APPLIED/);
  assert.match(sql, /security_invoker = on/);
  assert.match(sql, /jrl_is_owner/);
  assert.match(sql, /revoke all on table public\.%I from anon, public/);
  assert.equal(/create policy[\s\S]*to anon/i.test(sql), false);
  assert.equal(/enable signup|signups enabled/i.test(sql), false);
});
