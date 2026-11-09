const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { hashPin, pinGrantValid, pinMatches, signPinGrant, validPin } = require('../lib/jrl/pin');
const { pinCheck, pinSave, pinStatus } = require('../lib/jrl/pinHttp');
const { signSession, cookieName } = require('../lib/auth');
const { mergeForecastCells, parseCsv, readForecastSheet } = require('../lib/forecast/liveSheet');

test('a PIN stays off until it is set, and the hash is not the PIN', async () => {
  assert.equal(validPin('1234'), true);
  assert.equal(validPin('12'), false);
  const env = { DASHBOARD_SESSION_SECRET: 'session-secret-for-test', NODE_ENV: 'test' };
  const previous = process.env.DASHBOARD_SESSION_SECRET;
  process.env.DASHBOARD_SESSION_SECRET = env.DASHBOARD_SESSION_SECRET;
  let hash = null;
  const store = {
    async readAccessPin() { return { ok: true, enabled: Boolean(hash), hash }; },
    async saveAccessPin(next) { hash = next; return { ok: true, enabled: Boolean(next) }; },
  };
  const openAppStore = () => ({ ok: true, store });
  const admin = signSession({ role: 'admin', areas: ['jrl', 'toki'] }, env);
  const cookie = `${cookieName()}=${admin}`;
  try {
    const open = await pinStatus(new Request('http://localhost/api/cockpit/jrl/pin', { headers: { cookie } }), { env, openAppStore });
    assert.equal((await open.json()).enabled, false);
    const saved = await pinSave(new Request('http://localhost/api/cockpit/jrl/pin', {
      method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ pin: '2468' }),
    }), { env, openAppStore });
    assert.equal(saved.status, 200);
    assert.equal(hash.includes('2468'), false);
    assert.equal(pinMatches('2468', hash), true);
    const checked = await pinCheck(new Request('http://localhost/api/cockpit/jrl/pin', {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ pin: '2468' }),
    }), { env, openAppStore });
    assert.equal(checked.status, 200);
    const grant = checked.headers.get('set-cookie').split(';')[0].split('=').slice(1).join('=');
    assert.equal(pinGrantValid(grant, hash, env), true);
    assert.equal(pinGrantValid(grant, hashPin('9999'), env), false);
    const sql = fs.readFileSync(path.join(__dirname, '../supabase/jrl_access_pin.sql'), 'utf8');
    assert.match(sql, /create table cockpit\.jrl_access_pin/);
    assert.equal(/drop table cockpit\.income/i.test(sql), false);
    assert.equal(/grant delete/i.test(sql), false);
  } finally {
    if (previous == null) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previous;
  }
});

test('the forecast sheet fills a missing month and ignores the profiles CSV', async () => {
  const stored = [{ label: 'Retained Clients', month: '2026-10', enteredMinor: 1000, amountMinor: 1000 }];
  const sheet = [{ label: 'Retained Clients', month: '2026-11', enteredMinor: 1100, amountMinor: 1100 }];
  const merged = mergeForecastCells(stored, sheet);
  assert.equal(merged.find((cell) => cell.month === '2026-11').enteredMinor, 1100);
  assert.equal(merged.find((cell) => cell.month === '2026-10').enteredMinor, 1000);
  const grid = parseCsv(' ,January 2026\nRetained Clients,10');
  assert.equal(grid[1][1], '10');
  const closed = await readForecastSheet({ SHEET_CSV_URL: 'https://example.invalid/profiles.csv' }, async () => {
    throw new Error('should not fetch the profiles sheet');
  });
  assert.equal(closed.configured, false);
  assert.equal(closed.cells.length, 0);
});
