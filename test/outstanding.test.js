const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validateOutstanding } = require('../lib/planning/outstanding');
const { openFileStore } = require('../lib/store/fileStore');
const { outstandingGet, outstandingPatch, outstandingPost } = require('../lib/cockpit/http');
const { signSession, cookieName } = require('../lib/auth');

test('an outstanding title is required and a blank title is refused', () => {
  assert.equal(validateOutstanding({ title: '  Send the invoice  ' }).ok, true);
  assert.equal(validateOutstanding({ title: '   ' }).ok, false);
  assert.equal(validateOutstanding({ title: 'x'.repeat(201) }).ok, false);
});

test('the outstanding migration only creates the new table', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/outstanding_items.sql'), 'utf8');
  assert.match(sql, /create table cockpit\.outstanding_items/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /force row level security/);
  assert.match(sql, /revoke all on table cockpit\.outstanding_items from public, anon, authenticated/);
  assert.match(sql, /grant select, insert, update on table cockpit\.outstanding_items to service_role/);
  assert.equal(/grant delete/i.test(sql), false);
  assert.equal(/drop table/i.test(sql), false);
  assert.equal(/alter table cockpit\.income_detail_lines/i.test(sql), false);
  assert.equal(/plan_entries/i.test(sql), false);
  const rollback = fs.readFileSync(path.join(__dirname, '../supabase/outstanding_items_rollback.sql'), 'utf8');
  assert.match(rollback, /drop table if exists cockpit\.outstanding_items/);
  assert.equal(/income_detail_lines/i.test(rollback), false);
});

test('a file store keeps an open item and hides it once it is ticked', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'toki-todo-'));
  const store = openFileStore(path.join(directory, 'store.enc'), {
    APP_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64'),
  });
  const saved = store.saveOutstanding({ id: 'todo_1', title: 'Chase the retainer' });
  assert.equal(saved.title, 'Chase the retainer');
  assert.equal(store.listOutstanding().length, 1);
  assert.equal(store.completeOutstanding('todo_1').done, true);
  assert.equal(store.listOutstanding().length, 0);
  assert.equal(store.completeOutstanding('todo_1').done, false);
});

test('outstanding routes require a cockpit session and do not invent items', async () => {
  const env = { DASHBOARD_SESSION_SECRET: 'session-secret-for-test', NODE_ENV: 'test' };
  const previous = process.env.DASHBOARD_SESSION_SECRET;
  process.env.DASHBOARD_SESSION_SECRET = env.DASHBOARD_SESSION_SECRET;
  const items = [];
  const store = {
    async listOutstanding() { return items.filter((item) => !item.doneAt); },
    async saveOutstanding(item) { items.push(item); return item; },
    async completeOutstanding(id) {
      const row = items.find((item) => item.id === id && !item.doneAt);
      if (!row) return { done: false, id };
      row.doneAt = new Date().toISOString();
      return { done: true, id };
    },
  };
  const open = () => ({ ok: true, status: { backend: 'supabase', shared: true }, store });
  try {
    const closed = await outstandingGet(new Request('http://localhost/api/cockpit/outstanding'), { env, openAppStore: open });
    assert.equal(closed.status, 401);
    const admin = signSession({ role: 'admin', areas: ['toki'] }, env);
    const cookie = `${cookieName()}=${admin}`;
    const created = await outstandingPost(new Request('http://localhost/api/cockpit/outstanding', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Add the March cost' }),
    }), { env, openAppStore: open });
    assert.equal(created.status, 201);
    const listed = await outstandingGet(new Request('http://localhost/api/cockpit/outstanding', { headers: { cookie } }), { env, openAppStore: open });
    const body = await listed.json();
    assert.equal(body.stored, true);
    assert.equal(body.items.length, 1);
    const done = await outstandingPatch(new Request('http://localhost/api/cockpit/outstanding', {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ id: body.items[0].id }),
    }), { env, openAppStore: open });
    assert.equal(done.status, 200);
    const after = await outstandingGet(new Request('http://localhost/api/cockpit/outstanding', { headers: { cookie } }), { env, openAppStore: open });
    assert.equal((await after.json()).items.length, 0);
    const missing = await outstandingGet(new Request('http://localhost/api/cockpit/outstanding', { headers: { cookie } }), {
      env,
      openAppStore: () => ({
        ok: true,
        status: { backend: 'supabase', shared: true },
        store: { async listOutstanding() { return { ok: false, error: 'outstanding_schema_required', items: [] }; } },
      }),
    });
    const gap = await missing.json();
    assert.equal(gap.stored, false);
    assert.deepEqual(gap.items, []);
  } finally {
    if (previous == null) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previous;
  }
});
