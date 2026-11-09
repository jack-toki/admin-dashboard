const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { signSession, cookieName } = require('../lib/auth');
const { incomeDetailGet, incomeDetailPost, incomeDetailDelete } = require('../lib/cockpit/http');
const { workingMonthLines, incomeBreakdown, sumLines } = require('../lib/planning/entries');
const { scheduleFor, detailSum, reconcileKind, validateIncomeDetail, presentDetails, shownInMonth } = require('../lib/planning/incomeDetail');
const { adaptSnapshot, loadIncomeSource } = require('../lib/planning/incomeSource');
const { syntheticBaseline } = require('../lib/fixtures/synthetic');

const acme = {
  kind: 'retainer',
  party: 'Acme Ltd',
  amountMinor: 150000,
  firstPaymentMonth: '2026-10',
  contractEndDate: '2027-03-31',
  totalPayments: 6,
};

test('Acme November is scheduled 2 of 6 and an end date a month later changes the span', () => {
  assert.equal(scheduleFor(acme, '2026-11').label, 'Payment 2 of 6');
  assert.equal(scheduleFor(acme, '2026-11').received, false);
  assert.equal(scheduleFor(acme, '2026-09').label, 'No payment this month');
  assert.equal(scheduleFor(acme, '2027-04').state, 'outside');
  assert.equal(scheduleFor({ ...acme, contractEndDate: '2027-04-01', totalPayments: null }, '2027-04').label, 'Payment 7 of 7');
  assert.equal(scheduleFor({ ...acme, contractEndDate: '2027-02-28', totalPayments: null }, '2027-02').position, 5);
  assert.equal(scheduleFor({ firstPaymentMonth: '2026-12', contractEndDate: '2027-01-01' }, '2027-01').label, 'Payment 2 of 2');
  assert.equal(scheduleFor({ firstPaymentMonth: null, contractEndDate: null, comment: '2 of 6' }, '2026-11').state, 'unknown');
});

test('a known retainer needs an end date and an unknown import must not invent one', () => {
  assert.equal(validateIncomeDetail({ kind: 'retainer', party: 'Acme Ltd', amountMinor: 150000 }).ok, false);
  const unknown = validateIncomeDetail({ kind: 'retainer', party: 'Acme Ltd', amountMinor: 150000, source: 'snapshot', contractEndUnknown: true });
  assert.equal(unknown.ok, true);
  assert.equal(unknown.record.contractEndDate, null);
  assert.equal(unknown.record.contractEndUnknown, true);
  assert.equal(validateIncomeDetail({ kind: 'retainer', party: 'Acme Ltd', source: 'snapshot', contractEndUnknown: true, contractEndDate: '2027-03-31' }).ok, false);
  assert.equal(validateIncomeDetail({ ...acme, sourceRowId: '../sheet' }).ok, false);
  assert.equal(validateIncomeDetail({ ...acme, firstPaymentMonth: '2026-13' }).ok, false);
  assert.equal(validateIncomeDetail({ ...acme, observedMonth: '2026-00' }).ok, false);
  assert.equal(validateIncomeDetail({ ...acme, sourceRowId: 'sheet:3:retainer' }).record.sourceRowId, 'sheet:3:retainer');
});

test('a private snapshot file is adapted without inventing a contract end', () => {
  const records = adaptSnapshot({
    amountUnit: 'pounds',
    retainers: [{ sheet: 'retainer', row: 4, client: 'Example Retainer', amount: 15 }],
    projects: [{ sourceRowId: 'project:2', client: 'Example Project', amountMinor: 4000, month: '2026-11' }],
    costs: [{ sheet: 'cost', row: 8, name: 'Example Cost', amountPence: 250 }],
  });
  assert.equal(records.length, 3);
  const retainer = records.find((row) => row.kind === 'retainer');
  assert.equal(retainer.sourceRowId, 'retainer:4');
  assert.equal(retainer.amountMinor, 1500);
  assert.equal(retainer.contractEndDate, null);
  assert.equal(retainer.contractEndUnknown, true);
  assert.equal(retainer.source, 'snapshot');
  assert.equal(records.find((row) => row.kind === 'project').amountMinor, 4000);
  assert.equal(records.find((row) => row.kind === 'additional_cost').party, 'Example Cost');
  const missing = loadIncomeSource({ INCOME_SOURCE_SNAPSHOT: '' });
  assert.equal(missing.error, 'income_source_not_configured');
  assert.deepEqual(missing.records, []);
});

test('a missing amount stays missing and an explicit zero is summed', () => {
  const month = '2026-11';
  const rows = [
    { ...acme, id: 'a' },
    { kind: 'retainer', party: 'Blank Co', amountMinor: null, observedMonth: month },
  ];
  assert.equal(detailSum(rows, month, 'retainer'), null);
  const zeros = [{ kind: 'project', party: 'Zero Co', amountMinor: 0, observedMonth: month }];
  assert.equal(detailSum(zeros, month, 'project'), 0);
});

test('client lines do not change the forecast total and the gap can be negative', () => {
  const baseline = syntheticBaseline();
  const before = sumLines(workingMonthLines(baseline.rows, [], '2026-11'), 'sale');
  const withDetail = workingMonthLines(baseline.rows, [{ ...acme, layer: 'detail', id: 'detail_acme' }], '2026-11');
  assert.equal(sumLines(withDetail, 'sale'), before);
  const split = incomeBreakdown(withDetail);
  assert.equal(reconcileKind([acme], split.retainer, '2026-11', 'retainer').difference, 150000 - split.retainer);
  assert.equal(split.total, before);
  assert.equal(validateIncomeDetail({ kind: 'retainer', party: '', amountMinor: 1 }).ok, false);
});

test('stored snapshot rows stay visible without a source file and do not multiply across the year', () => {
  const months = [...Array.from({ length: 12 }, (_, index) => `2026-${String(index + 1).padStart(2, '0')}`), '2027-01'];
  const stamped = months.map((month, index) => ({
    id: `snap_${month}`,
    sourceRowId: `retainer:${index + 1}`,
    source: 'snapshot',
    layer: 'detail',
    kind: 'retainer',
    party: 'Example Retainer',
    amountMinor: month === '2026-11' ? 0 : 1000,
    contractEndDate: null,
    contractEndUnknown: true,
    firstPaymentMonth: null,
    observedMonth: month,
    comment: month === '2026-11' ? '2 of 6' : '',
    deletedAt: null,
  }));
  const unknown = {
    id: 'snap_unknown',
    sourceRowId: 'retainer:unknown',
    source: 'snapshot',
    kind: 'retainer',
    party: 'Unknown Amount',
    amountMinor: null,
    contractEndUnknown: true,
    observedMonth: '2026-11',
    comment: '3 of 6',
    deletedAt: null,
  };
  const duplicate = { ...stamped[10], id: 'snap_dup' };
  const shown = presentDetails([...stamped, duplicate, unknown], []);
  assert.equal(shown.filter((row) => row.sourceRowId === 'retainer:11').length, 1);
  assert.equal(shown.length, 14);
  for (const month of months) {
    const visible = shown.filter((row) => shownInMonth(row, month));
    assert.equal(visible.filter((row) => row.sourceRowId !== 'retainer:unknown').length, 1);
    assert.equal(visible[0].observedMonth === month || visible.some((row) => row.observedMonth === month), true);
  }
  assert.equal(detailSum(shown, '2026-11', 'retainer'), null);
  assert.equal(detailSum(shown.filter((row) => row.amountMinor != null), '2026-11', 'retainer'), 0);
  assert.equal(detailSum(shown.filter((row) => row.amountMinor != null), '2026-10', 'retainer'), 1000);
  assert.equal(detailSum(shown.filter((row) => row.amountMinor != null), '2027-01', 'retainer'), 1000);
  const noted = scheduleFor(unknown, '2026-11');
  assert.equal(noted.state, 'unknown');
  assert.equal(noted.received, false);
  assert.equal(noted.label, 'Note says 3 of 6. Payment number unknown');
  assert.equal(validateIncomeDetail(unknown).record.firstPaymentMonth, null);
  assert.equal(validateIncomeDetail(unknown).record.contractEndDate, null);
  assert.equal(validateIncomeDetail(unknown).record.totalPayments, null);
  const file = [{ ...stamped[0], id: 'file_copy', party: 'From file', amountMinor: 999 }];
  const edited = presentDetails([{ ...stamped[0], party: 'Edited', amountMinor: 50 }], file);
  assert.equal(edited.length, 1);
  assert.equal(edited[0].party, 'Edited');
  assert.equal(edited[0].amountMinor, 50);
  const removed = presentDetails([{ ...stamped[0], deletedAt: '2026-11-08T00:00:00Z' }], file);
  assert.equal(removed.length, 0);
  const baseline = syntheticBaseline();
  const forecast = sumLines(workingMonthLines(baseline.rows, [], '2026-11'), 'sale');
  const still = sumLines(workingMonthLines(baseline.rows, shown, '2026-11'), 'sale');
  assert.equal(still, forecast);
});

test('a tombstone stops the same source id from coming back', () => {
  const source = [{ sourceRowId: 'sheet:3:retainer', id: 'source_sheet_3', layer: 'detail', kind: 'retainer', party: 'Example', amountMinor: 100, deletedAt: null }];
  const shown = presentDetails([], source);
  assert.equal(shown.length, 1);
  const hidden = presentDetails([{ ...source[0], deletedAt: '2026-11-08T00:00:00Z' }], source);
  assert.equal(hidden.length, 0);
  const storedOnly = presentDetails([{ ...source[0], party: 'Stored Co' }], []);
  assert.equal(storedOnly.length, 1);
  assert.equal(storedOnly[0].party, 'Stored Co');
  const override = presentDetails([{ ...source[0], party: 'Renamed', amountMinor: 200 }], source);
  assert.equal(override.length, 1);
  assert.equal(override[0].party, 'Renamed');
  assert.equal(override[0].amountMinor, 200);
});

test('the file store saves a client line without adding a forecast row, and a shared store refuses', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'income-detail-'));
  const env = {
    APP_STORE: 'file',
    APP_STORE_PATH: path.join(directory, 'store.enc'),
    APP_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString('base64'),
    DASHBOARD_SESSION_SECRET: 'session-secret-for-test',
    NODE_ENV: 'test',
  };
  const previous = process.env.DASHBOARD_SESSION_SECRET;
  process.env.DASHBOARD_SESSION_SECRET = env.DASHBOARD_SESSION_SECRET;
  const admin = signSession({ role: 'admin', areas: ['toki'] }, env);
  const cookie = `${cookieName()}=${admin}`;
  try {
    const saved = await incomeDetailPost(new Request('http://localhost/api/cockpit/income-detail', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ ...acme, amount: 1500 }),
    }), { env });
    assert.equal(saved.status, 201);
    const body = await saved.json();
    assert.equal(body.stored, true);
    assert.equal(body.planCount, 0);
    assert.equal(body.record.contractEndDate, '2027-03-31');
    const listed = await incomeDetailGet(new Request('http://localhost/api/cockpit/income-detail', { headers: { cookie } }), { env });
    const again = await listed.json();
    assert.equal(again.records.length, 1);
    const removed = await incomeDetailDelete(new Request('http://localhost/api/cockpit/income-detail', {
      method: 'DELETE',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ id: body.record.id }),
    }), { env });
    assert.equal(removed.status, 200);
    const shared = await incomeDetailPost(new Request('http://localhost/api/cockpit/income-detail', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ ...acme, amount: 1500 }),
    }), {
      env,
      openAppStore: () => ({
        ok: true,
        status: { backend: 'supabase', shared: true },
        store: {
          async saveIncomeDetail() { return { ok: false, error: 'income_detail_schema_required' }; },
          listPlans() { throw new Error('plans'); },
        },
      }),
    });
    assert.equal(shared.status, 409);
    const gap = await shared.json();
    assert.equal(gap.error, 'income_detail_schema_required');
    assert.equal(gap.stored, false);
  } finally {
    if (previous == null) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previous;
  }
});

test('a signed-in read shows stored snapshot rows when no source file is configured', async () => {
  const env = {
    DASHBOARD_SESSION_SECRET: 'session-secret-for-test',
    NODE_ENV: 'test',
  };
  const previous = process.env.DASHBOARD_SESSION_SECRET;
  const previousSource = process.env.INCOME_SOURCE_SNAPSHOT;
  process.env.DASHBOARD_SESSION_SECRET = env.DASHBOARD_SESSION_SECRET;
  delete process.env.INCOME_SOURCE_SNAPSHOT;
  const admin = signSession({ role: 'admin', areas: ['toki'] }, env);
  const cookie = `${cookieName()}=${admin}`;
  try {
    const listed = await incomeDetailGet(new Request('http://localhost/api/cockpit/income-detail', { headers: { cookie } }), {
      env,
      openAppStore: () => ({
        ok: true,
        status: { backend: 'supabase', shared: true },
        store: {
          async listIncomeDetails() {
            return [
              { id: 'snap_1', sourceRowId: 'retainer:4', source: 'snapshot', layer: 'detail', kind: 'retainer', party: 'Stored Co', amountMinor: 0, contractEndUnknown: true, comment: '2 of 6', observedMonth: '2026-11', deletedAt: null },
              { id: 'manual_1', source: 'manual', layer: 'detail', kind: 'project', party: 'Manual Co', amountMinor: 100, contractEndDate: '2027-01-31', firstPaymentMonth: '2026-11', deletedAt: null },
            ];
          },
          listPlans() { throw new Error('plans'); },
        },
      }),
    });
    assert.equal(listed.status, 200);
    const body = await listed.json();
    assert.equal(body.stored, true);
    assert.equal(body.source.error, 'income_source_not_configured');
    assert.equal(body.source.ok, false);
    assert.deepEqual(body.records.map((row) => row.party), ['Stored Co', 'Manual Co']);
    assert.equal(body.records[0].amountMinor, 0);
    assert.equal(JSON.stringify(body).includes('unavailable'), false);
  } finally {
    if (previous == null) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previous;
    if (previousSource == null) delete process.env.INCOME_SOURCE_SNAPSHOT;
    else process.env.INCOME_SOURCE_SNAPSHOT = previousSource;
  }
});
