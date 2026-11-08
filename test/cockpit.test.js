const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAmount, formatMinor } = require('../lib/money');
const { classifyLine } = require('../lib/groups');
const { parseFirstTab, selectBaseline, detectRangeAnomaly, consistentMonthlyCost } = require('../lib/pnl/parseFirstTab');
const { comparePair, ytd } = require('../lib/pnl/variance');
const { reconcileClientMonth } = require('../lib/pnl/reconcile');
const { validateEntry, expandTimeline, workingPlanMinor, salesFromCrm } = require('../lib/planning/entries');
const { samePerson, classifyNewConversation, identityKeys, toPublicActivity } = require('../lib/activity/identity');
const { monthKeyFromSerial, monthKeyFromHeader, crmDealView } = require('../lib/pipeline/dates');
const { parseLegacyBody, resolveLegacyTimestamp, handleLegacyIngest } = require('../lib/automations/legacyIngest');
const { matchProfile } = require('../lib/automations/identity');
const { summariseObservations, estimateSavings } = require('../lib/automations/value');
const { acceptEvent, createMemoryStore } = require('../lib/automations/events');
const { registerWorkflow, healthFor } = require('../lib/automations/registry');
const { COVERAGE_SNAPSHOT, ZAPIER_ONBOARDING } = require('../lib/automations/coverage');
const { xeroStatus, XERO_SCOPES, assertReadOnlyXeroPath, encryptToken, decryptToken, signOAuthState, verifyOAuthState } = require('../lib/xero/oauth');
const { jrlView } = require('../lib/jrl/status');
const { authenticatePassword, signSession, verifySession } = require('../lib/auth');
const { boardExport } = require('../lib/workspace/cockpit');

test('amounts keep zero, negatives, and blanks distinct', () => {
  assert.equal(parseAmount('0').minor, 0);
  assert.equal(parseAmount('-10.50').minor, -1050);
  assert.equal(parseAmount('(6,697.00)').minor, -669700);
  assert.equal(parseAmount('').ok, false);
  assert.equal(parseAmount(null).reason, 'blank');
  assert.match(formatMinor(-1050), /^-GBP 10\.50$/);
});

test('first tab is the only baseline and gross profit stays named', () => {
  const grid = [
    ['', 'January', 'February', '', 'January 2027'],
    ['Billing'],
    ['Retained Clients', '100', '0', '', '80'],
    ['Project Work', '40', '-20', '', ''],
    ['Gross Profit', '140', '-20', '', '80'],
    ['Costs'],
    ['Cursor', '', '5', '', '5'],
    ['Monthly Cost', '10', '5', '', '5'],
  ];
  const chosen = selectBaseline([
    { title: 'Forecast Profit & Loss V2', sheetId: 1862815893, grid: [['', 'January'], ['Retained Clients', '99999']] },
    { title: 'Forecast Profit & Loss', sheetId: 1455407915, grid },
  ]);
  assert.equal(chosen.baseline.sourceVersion, 'forecast-profit-and-loss');
  assert.equal(chosen.baseline.rows.find((row) => row.label === 'Retained Clients').cells['2026-01'].minor, 10000);
  assert.equal(chosen.rejected[0].role, 'different_baseline_not_used');
  assert.match(chosen.baseline.grossProfitMeaning, /billing lines/i);
  assert.equal(classifyLine('Cursor').sourceConfirmed, false);
  assert.equal(classifyLine('Cursor').provenance, 'suggested');
  assert.equal(classifyLine('Office').groupId, 'premises');
});

test('monthly cost formula anomaly is flagged and not corrected', () => {
  const columns = [{ index: 1, role: 'month', key: '2026-01' }, { index: 4, role: 'month', key: '2027-01' }];
  const anomaly = detectRangeAnomaly(['', '=SUM(B9:B34)', '', '', '=SUM(O12:O34)'], columns);
  assert.equal(anomaly.code, 'monthly_cost_range_differs');
  assert.deepEqual(anomaly.omittedFrom[0].omittedRows, [9, 10, 11]);
  const model = parseFirstTab([
    ['', 'January'],
    ['Costs'],
    ['Example Tool', '10'],
    ['Other', ''],
  ]);
  assert.equal(consistentMonthlyCost(model, '2026-01'), 1000);
});

test('variance sign, missing people, and partial coverage', () => {
  const revenue = comparePair({ kind: 'revenue', forecastMinor: 14000, actualMinor: 12000, basis: 'accounting', vat: 'none' });
  assert.equal(revenue.rawDifference, -2000);
  assert.equal(revenue.direction, 'unfavourable');
  const cost = comparePair({ kind: 'cost', forecastMinor: 1000, actualMinor: 800, basis: 'accounting', vat: 'none' });
  assert.equal(cost.rawDifference, -200);
  assert.equal(cost.direction, 'favourable');
  const people = comparePair({ kind: 'cost', forecastMinor: 3000, actualMinor: 0, actualKnown: false });
  assert.equal(people.rawDifference, null);
  assert.equal(people.judgement, 'unknown');
  assert.notEqual(people.direction, 'favourable');
  const zero = comparePair({ kind: 'revenue', forecastMinor: 0, actualMinor: 100, basis: 'accounting', vat: 'none' });
  assert.equal(zero.percent, null);
  const partial = ytd([
    { month: '2026-01', forecastMinor: 1, actualMinor: 1, forecastCoverage: 'full', actualCoverage: 'full', actualKnown: true },
    { month: '2026-08', forecastMinor: 1, actualMinor: null, forecastCoverage: 'full', actualCoverage: 'partial', actualKnown: false },
  ]);
  assert.deepEqual(partial.months, ['2026-01']);
  assert.deepEqual(partial.excluded, ['2026-08']);
});

test('monthly sheet is reconciled and does not overwrite', () => {
  const result = reconcileClientMonth({ month: '2026-11', baselineRetained: 100, baselineProject: null, sheetRetained: 90, sheetProject: 10 });
  assert.equal(result.overwritten, false);
  assert.equal(result.retained.difference, -10);
  assert.equal(result.project.difference, null);
});

test('manual plan entries, recurrence, and no CRM auto sale', () => {
  const negative = validateEntry({ kind: 'cost', amountMinor: -500, currency: 'GBP', month: '2026-06', party: 'Example Vendor', groupId: 'administration' });
  assert.equal(negative.ok, true);
  assert.equal(negative.entry.amountMinor, -500);
  const zero = validateEntry({ kind: 'sale', amountMinor: 0, currency: 'USD', month: '2026-11', party: 'Example Client', groupId: 'billing', attestation: 'paid' });
  assert.equal(zero.entry.xeroVerified, false);
  assert.equal(zero.entry.attestationSource, 'manual');
  const recurring = validateEntry({ kind: 'sale', amountMinor: 100, currency: 'GBP', month: '2026-11', party: 'Example Client', groupId: 'billing', timing: 'recurring', durationMonths: 3 });
  assert.deepEqual(expandTimeline(recurring.entry), ['2026-11', '2026-12', '2027-01']);
  assert.equal(workingPlanMinor(80, [{ ...recurring.entry, matchId: 'actual-1' }], '2026-11', 'billing'), 80);
  assert.equal(workingPlanMinor(80, [recurring.entry], '2026-11', 'billing'), 180);
  assert.deepEqual(salesFromCrm([{ status: 'closed won' }]), []);
});

test('contact identity ignores email domain and does not auto-count new conversations', () => {
  const ada = { email: 'ada@example.com', contactId: 'c1' };
  const grace = { email: 'grace@example.com' };
  assert.equal(samePerson(ada, grace), false);
  assert.equal(identityKeys({ email: 'ada@example.com', leadId: 'lead-1' }).some((key) => key.startsWith('domain:')), false);
  assert.equal(classifyNewConversation({ evidence: 'calendar', priorKnowledge: 'unknown', historyComplete: false }).classification, 'needs_review');
  assert.equal(classifyNewConversation({ evidence: 'discovery', priorKnowledge: 'confirmed_unfamiliar', historyComplete: true }).classification, 'needs_review');
  assert.equal(classifyNewConversation({ evidence: 'held', priorKnowledge: 'confirmed_unfamiliar', historyComplete: false }).classification, 'needs_review');
  assert.equal(classifyNewConversation({ evidence: 'held', priorKnowledge: 'confirmed_unfamiliar', historyComplete: true, leadSource: 'Returning Customer' }).classification, 'not_new');
  assert.equal(classifyNewConversation({ evidence: 'user_confirmed_first', priorKnowledge: 'confirmed_unfamiliar', historyComplete: true }).classification, 'new');
  const pub = toPublicActivity({ leadId: 'lead-1', classification: 'needs_review', email: 'ada@example.com' });
  assert.equal(pub.email, undefined);
});

test('pipeline dates use serials and stars are not a percent', () => {
  assert.equal(monthKeyFromSerial(46260), '2026-08');
  assert.equal(monthKeyFromSerial(46594), '2027-07');
  assert.equal(monthKeyFromHeader('Jan 26').key, null);
  assert.equal(monthKeyFromHeader(46260).key, '2026-08');
  const won = crmDealView({ leadId: 'lead-1', status: 'closed won', confidenceStars: 3, deadline: '2026-12-01', dateClosed: null });
  assert.equal(won.confidenceIsProbability, false);
  assert.equal(won.deadlineIsCloseDate, false);
  assert.equal(won.wonDate, 'unknown');
  assert.equal(won.inFinancialPlan, false);
});

test('legacy ingest keeps every post and accepts form bodies and placeholder timestamps', async () => {
  const inserts = [];
  const db = { from() { return { insert(row) { inserts.push(row); return { error: null }; } }; } };
  const first = await handleLegacyIngest({
    account: 'harewood-surveyors',
    secret: 'test-secret',
    configuredSecret: 'test-secret',
    body: parseLegacyBody('zap=Example&zap_id=99&ts={{zap_meta_utc_iso}}', 'application/x-www-form-urlencoded'),
    db,
    now: new Date('2026-11-08T12:00:00Z'),
  });
  const second = await handleLegacyIngest({
    account: 'harewood-surveyors',
    secret: 'test-secret',
    configuredSecret: 'test-secret',
    body: { zap: 'Example', zap_id: '99', ts: '2026-11-01T00:00:00Z' },
    db,
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.ts_warning, 'timestamp_placeholder');
  assert.equal(inserts.length, 2);
  assert.equal(inserts[0].zap_id, '99');
  assert.equal(inserts[1].zap_id, '99');
  assert.equal(second.body.ok, true);
  assert.equal(resolveLegacyTimestamp('{{zap_meta_utc_iso}}', new Date('2026-01-01Z')).warning, 'timestamp_placeholder');
  const denied = await handleLegacyIngest({ account: 'aa-surveys', secret: '', configuredSecret: 'test-secret', body: {}, db });
  assert.equal(denied.status, 401);
});

test('profile identity prefers zap id and warns on title collisions', () => {
  const profiles = [
    { account: 'Example', automation: 'Same title', zapId: '' },
    { account: 'Example', automation: 'Same title', zapId: '' },
    { account: 'Example', automation: 'Other', zapId: '42' },
  ];
  const ambiguous = matchProfile({ account: 'Example', title: 'Same title' }, profiles);
  assert.equal(ambiguous.profile, null);
  assert.ok(ambiguous.warnings.includes('title_ambiguous'));
  assert.ok(ambiguous.warnings.includes('profile_zap_id_blank'));
  const byId = matchProfile({ account: 'Example', zapId: '42', title: 'Renamed' }, profiles);
  assert.equal(byId.via, 'zap_id');
  assert.equal(byId.profile.automation, 'Other');
});

test('savings are withheld when posts have no run id and zap id is not a dedupe key', () => {
  const summary = summariseObservations([
    { zapId: '9', eventId: 'a', status: 'success' },
    { zapId: '9', eventId: 'b', status: 'success' },
    { zapId: '9', eventId: 'b', attempt: 2, status: 'success' },
  ]);
  assert.equal(summary.checkpointPosts, 2);
  assert.equal(summary.uniqueRuns, null);
  assert.equal(summary.droppedByZapId, false);
  assert.equal(estimateSavings(summary).withheld, true);
  const withRuns = summariseObservations([
    { zapId: '9', runId: 'run-1', eventId: 'a', stageId: 's1', status: 'success' },
    { zapId: '9', runId: 'run-1', eventId: 'c', stageId: 's2', status: 'success' },
    { zapId: '9', runId: 'run-2', eventId: 'd', status: 'success' },
  ]);
  assert.equal(withRuns.checkpointPosts, 3);
  assert.equal(withRuns.uniqueRuns, 2);
  const savings = estimateSavings(withRuns);
  assert.equal(savings.measured, false);
  assert.equal(savings.assumption.minutesPerRun, 7);
  assert.equal(savings.assumption.hourlyRate, 50);
});

test('new events dedupe by event id and registration does not install a listener', () => {
  const store = createMemoryStore();
  const first = acceptEvent(store, { contract: 'toki.automation.event.v1', accountSlug: 'aa-surveys', zapId: '9', eventId: 'e1', runId: 'r1', status: 'success', attempt: 1 });
  const retry = acceptEvent(store, { contract: 'toki.automation.event.v1', accountSlug: 'aa-surveys', zapId: '9', eventId: 'e1', runId: 'r1', status: 'success', attempt: 2 });
  assert.equal(first.deduped, false);
  assert.equal(retry.deduped, true);
  assert.equal(store.all().length, 1);
  const registry = new Map();
  const adapter = { get: (key) => registry.get(key) || null, set: (key, value) => registry.set(key, value) };
  const created = registerWorkflow(adapter, { accountSlug: 'aa-surveys', zapId: '9', title: 'Example' });
  assert.equal(created.record.zapierListener, false);
  assert.equal(ZAPIER_ONBOARDING.listenerInstalled, false);
  assert.equal(ZAPIER_ONBOARDING.state, 'proposed_unverified');
  assert.equal(healthFor(created.record, []).state, 'no_events');
  assert.equal(healthFor(created.record, []).failed, false);
  assert.equal(COVERAGE_SNAPSHOT.liveHttpTested, false);
  assert.equal(COVERAGE_SNAPSHOT.clientOnWithIngest, 73);
  assert.equal(COVERAGE_SNAPSHOT.jackOwnOnWithIngest, 0);
  assert.equal(COVERAGE_SNAPSHOT.louise, 'not_in_snapshot');
});

test('xero status is read-only oauth and does not echo secrets', () => {
  const env = { XERO_CLIENT_SECRET: 'super-secret-value', XERO_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') };
  const status = xeroStatus(env);
  assert.equal(JSON.stringify(status).includes('super-secret-value'), false);
  assert.equal(status.customConnection, false);
  assert.equal(status.scopes.includes('accounting.transactions'), false);
  assert.ok(status.scopes.includes('accounting.transactions.read'));
  assert.equal(XERO_SCOPES.includes('accounting.transactions'), false);
  assert.throws(() => assertReadOnlyXeroPath('POST', '/Invoices'), /xero_write_blocked/);
  assert.throws(() => assertReadOnlyXeroPath('GET', '/BankTransactions'), /xero_path_blocked/);
  const enc = encryptToken({ refresh: 'abc' }, env);
  assert.equal(JSON.stringify(enc).includes('abc'), false);
  assert.deepEqual(decryptToken(enc.ciphertext, env).payload, { refresh: 'abc' });
  const state = signOAuthState({ nonce: 'n', exp: Date.now() + 1000 }, 'session-secret');
  assert.ok(verifyOAuthState(state, 'session-secret'));
  assert.equal(verifyOAuthState(state, 'other'), null);
});

test('sidebar remembers compact or expanded and only lists allowed areas', () => {
  const { readCollapsed, writeCollapsed, toggleCollapsed, visibleNav, NAV_STORAGE_KEY, COCKPIT_ROUTES, TOKI_VIEWS } = require('../lib/nav/sidebar');
  const storage = new Map();
  const memory = { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
  assert.equal(readCollapsed(memory), false);
  assert.equal(toggleCollapsed(memory), true);
  assert.equal(memory.getItem(NAV_STORAGE_KEY), 'compact');
  assert.equal(toggleCollapsed(memory), false);
  assert.deepEqual(TOKI_VIEWS.map((item) => item.label), ['Overview', 'Plan', 'Sources']);
  assert.deepEqual(visibleNav(['jrl', 'toki', 'automations']).map((item) => item.label), ['JRL', 'Toki', 'Automations']);
  assert.deepEqual(visibleNav(['toki', 'automations']).map((item) => item.id), ['toki', 'automations']);
  assert.equal(visibleNav(['jrl']).some((item) => item.id === 'toki'), false);
  assert.equal(COCKPIT_ROUTES.nativeApp, false);
  assert.equal(COCKPIT_ROUTES.home, '/cockpit');
});

test('auth fails closed and JRL stays off the Toki board', () => {
  const env = { DASHBOARD_PASSWORD: 'admin-pass', DASHBOARD_SESSION_SECRET: 'session-secret', JRL_PASSWORD: 'jrl-pass', CLIENT_ACCESS_KEYS: '{"client-key":"Example Client"}' };
  assert.equal(authenticatePassword('nope', env).ok, false);
  const admin = authenticatePassword('admin-pass', env);
  const token = signSession(admin.session, env);
  assert.equal(verifySession(token, env).role, 'admin');
  const client = authenticatePassword('client-key', env).session;
  assert.equal(jrlView(client).status, 403);
  assert.equal(jrlView(admin.session).body.entries.length, 0);
  assert.equal(jrlView(admin.session).body.source.repoVisible, false);
  const board = boardExport({ forecast: { minor: 100 }, jrl: { balance: 1 }, note: 'toki only' });
  assert.equal(board.ok, true);
  assert.equal(board.body.jrl, undefined);
  assert.equal(board.body.jrlIncluded, false);
});
