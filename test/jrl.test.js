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
const { classifyAnonKey, describeJrlProject, sealJrlSession, openJrlSession, signInJrlPassword, JRL_COOKIE, safeCockpitReturn } = require('../lib/jrl/session');
const { jrlGet } = require('../lib/jrl/http');
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
  assert.match(sql, /revoke all on table public\.%I from public, anon, authenticated/);
  assert.equal(/create policy[\s\S]*to anon/i.test(sql), false);
  assert.equal(/enable signup|signups enabled/i.test(sql), false);
});

function fakeJwt(payload) {
  return `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
}

test('a legacy anon JWT is accepted and a service role key is refused', async () => {
  const anon = fakeJwt({ role: 'anon', ref: 'uxkpqmyzxtjmmixlycio' });
  const service = fakeJwt({ role: 'service_role', ref: 'uxkpqmyzxtjmmixlycio' });
  assert.equal(classifyAnonKey(anon).format, 'legacy_jwt');
  assert.equal(classifyAnonKey(anon).accepted, true);
  assert.equal(classifyAnonKey(service).accepted, false);
  assert.equal(classifyAnonKey('sb_publishable_example').accepted, true);
  assert.equal(classifyAnonKey('sb_publishable_example').format, 'publishable');
  const env = {
    JRL_SUPABASE_URL: 'https://uxkpqmyzxtjmmixlycio.supabase.co',
    JRL_SUPABASE_ANON_KEY: anon,
    DASHBOARD_SESSION_SECRET: 'session-secret-for-test',
    NODE_ENV: 'test',
  };
  const project = describeJrlProject(env);
  assert.equal(project.configured, true);
  assert.equal(project.publishableKeyRequired, false);
  assert.equal(project.projectRefMatches, true);
  assert.equal(describeJrlProject({ ...env, JRL_SUPABASE_URL: 'https://hcjybjpimqzsueyslxvl.supabase.co' }).configured, false);
  assert.equal(describeJrlProject({ ...env, JRL_SUPABASE_ANON_KEY: service }).keyAccepted, false);
  const gap = jrlAuthGap(env);
  assert.equal(gap.keyFormat, 'legacy_jwt');
  assert.equal(gap.publishableKeyRequired, false);
  assert.equal(JSON.stringify(gap).includes(anon), false);
  assert.equal(safeCockpitReturn('https://evil.example/cockpit'), '/cockpit');
  assert.equal(safeCockpitReturn('/cockpit#jrl'), '/cockpit#jrl');

  let seen = null;
  const signed = await signInJrlPassword({
    email: 'person@example.com',
    password: 'secret-password',
    env,
    fetchImpl: async (url, init) => {
      seen = { url, init };
      return { ok: true, json: async () => ({ access_token: 'user-access', refresh_token: 'user-refresh', expires_in: 3600 }) };
    },
  });
  assert.equal(signed.ok, true);
  assert.equal(seen.url, 'https://uxkpqmyzxtjmmixlycio.supabase.co/auth/v1/token?grant_type=password');
  assert.equal(seen.init.headers.apikey, anon);
  assert.equal(seen.init.headers.Authorization, `Bearer ${anon}`);
  assert.equal(JSON.stringify(seen).includes('service_role'), false);
  const opened = openJrlSession(sealJrlSession(signed.session, env), env);
  assert.equal(opened.accessToken, 'user-access');

  const previousSecret = process.env.DASHBOARD_SESSION_SECRET;
  process.env.DASHBOARD_SESSION_SECRET = env.DASHBOARD_SESSION_SECRET;
  try {
    const cockpit = signSession({ role: 'admin', areas: ['jrl', 'toki', 'automations'] }, env);
    const sealed = sealJrlSession({ accessToken: 'user-access', refreshToken: 'user-refresh', expiresAt: Date.now() + 3_600_000 }, env);
    let calls = 0;
    const res = await jrlGet(new Request('http://localhost/api/cockpit/jrl', {
      headers: { cookie: `${cookieName()}=${cockpit}; ${JRL_COOKIE}=${encodeURIComponent(sealed)}` },
    }), {
      env,
      fetchImpl: async (url, init) => {
        calls += 1;
        assert.equal(url, 'https://uxkpqmyzxtjmmixlycio.supabase.co/rest/v1/monthly_finance?select=*');
        assert.equal(init.headers.Authorization, 'Bearer user-access');
        assert.equal(init.headers.apikey, anon);
        return { ok: true, json: async () => [{ period: '2026-10-01', tax_in: 1, savings_in: 2, hl_in: 3, savings_out: 0, hl_value: null }] };
      },
    });
    const body = await res.json();
    assert.equal(calls, 1);
    assert.equal(body.auth.supabaseUser, true);
    assert.equal(body.entries.length, 1);
    assert.equal(body.entries[0].hl_value, null);
    assert.equal(body.balances, null);
    assert.equal(JSON.stringify(body).includes(anon), false);
    assert.equal(JSON.stringify(body).includes('user-access'), false);
  } finally {
    if (previousSecret == null) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previousSecret;
  }
});
