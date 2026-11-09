// Off until JRL_OWNER_LINK is exactly "on". A cockpit passcode does not open the ledger before that.
// The owner id is JRL_OWNER_SUB. It is configured out of band and must be the same uuid written
// into jrl_owner_pin by the approved migration. The first signed-in user is not adopted.
// The file store is refused: two processes can both read one generation and both refresh.
// A shared store must compare-and-swap on generation. A failed or crashed refresh leaves the
// persisted refresh token in place. This module does not turn the link on.

import { describeJrlProject, refreshJrlSession } from './session.js';

export const OWNER_LINK_RISK = 'Anyone who can pass the cockpit passcode can read and write the JRL ledger as the linked owner. The passcode is one shared secret, not a separate person.';

const OWNER_SUB = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LINK_ERRORS = new Set([
  'owner_link_off', 'owner_sub_not_configured', 'owner_email_not_configured', 'owner_email_rejected',
  'link_store_not_ready', 'file_store_not_shared', 'not_configured', 'not_linked', 'store_unreadable',
  'store_failed', 'schema_unconfirmed', 'target_mismatch', 'cross_owner', 'refresh_in_progress',
  'refresh_unavailable', 'revoked', 'conflict', 'encryption_key_missing',
]);

export function safeLinkError(code) {
  return LINK_ERRORS.has(code) ? code : 'store_failed';
}
const LEASE_MS = 20_000;

export function ownerLinkEnabled(env = process.env) {
  return env.JRL_OWNER_LINK === 'on';
}

export function expectedOwnerSub(env = process.env) {
  const value = String(env.JRL_OWNER_SUB || '').trim().toLowerCase();
  if (!OWNER_SUB.test(value)) return null;
  return value;
}

export function subjectFromAccessToken(token) {
  const part = String(token || '').split('.')[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    if (!payload?.sub || payload.role === 'anon' || payload.role === 'service_role') return null;
    if (payload.role && payload.role !== 'authenticated') return null;
    return { sub: String(payload.sub).toLowerCase() };
  } catch {
    return null;
  }
}

export function rejectCrossSiteMutation(req) {
  const site = String(req.headers.get('sec-fetch-site') || '').toLowerCase();
  if (site && site !== 'same-origin') return { ok: false, error: 'cross_site' };
  if (req.headers.get('x-cockpit-link') !== '1') return { ok: false, error: 'cross_site' };
  let expected = '';
  try { expected = new URL(req.url).origin; } catch { expected = ''; }
  const origin = req.headers.get('origin') || '';
  if (!origin || !expected || origin !== expected) return { ok: false, error: 'cross_site' };
  return { ok: true };
}

function exclusiveStore() {
  let row = null;
  let tail = Promise.resolve();
  function exclusive(fn) {
    const run = tail.then(fn, fn);
    tail = run.then(() => {}, () => {});
    return run;
  }
  return {
    read() {
      return exclusive(() => (row ? { ...row } : null));
    },
    cas(expectedGeneration, record) {
      return exclusive(() => {
        const current = row?.generation || 0;
        if (current !== expectedGeneration) return { ok: false, conflict: true, record: row ? { ...row } : null };
        row = { ...record, generation: expectedGeneration + 1 };
        return { ok: true, record: { ...row } };
      });
    },
  };
}

// Test double of one database row. Production uses compareAndSwapOauthToken.
export function memoryOwnerStore() {
  return { ready: true, shared: true, backend: 'memory', ...exclusiveStore() };
}

export function ownerLinkStore(store) {
  if (!store || store.backend === 'file' || store.shared !== true || typeof store.readToken !== 'function' || typeof store.compareAndSwapToken !== 'function') {
    return { ready: false, shared: false, error: store?.backend === 'file' || store?.shared === false ? 'file_store_not_shared' : 'link_store_not_ready' };
  }
  return {
    ready: true,
    shared: true,
    backend: store.backend,
    async read() {
      try {
        const row = await store.readToken({ provider: 'jrl', tenantKey: 'owner' });
        if (row?.error) return { error: row.error };
        return row;
      } catch (error) {
        return { error: safeLinkError(error?.code), probe: error?.probe || null };
      }
    },
    cas(expectedGeneration, record) {
      return store.compareAndSwapToken({
        provider: 'jrl',
        tenantKey: 'owner',
        expectedGeneration,
        payload: record,
      });
    },
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReady(store, wait) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const row = await store.read();
    if (!row || row.error || row.phase !== 'rotating') return row;
    await wait(attempt);
  }
  return store.read();
}

function usable(row, expected) {
  if (!row || row.error || row.revoked || row.phase === 'rotating' || !row.accessToken) return null;
  if (String(row.sub || '').toLowerCase() !== expected) return null;
  const identity = subjectFromAccessToken(row.accessToken);
  if (!identity || identity.sub !== expected) return null;
  return { ok: true, accessToken: row.accessToken, expiresAt: row.expiresAt, refreshed: false };
}

function keptToken(basis) {
  return {
    sub: basis.sub,
    refreshToken: basis.refreshToken,
    accessToken: basis.accessToken || '',
    expiresAt: basis.expiresAt || 0,
    revoked: false,
    phase: 'ready',
  };
}

export async function establishOwnerLink({ store, session, env = process.env }) {
  if (!ownerLinkEnabled(env)) return { ok: false, skipped: true };
  const expected = expectedOwnerSub(env);
  if (!expected) return { ok: false, error: 'owner_sub_not_configured' };
  const identity = subjectFromAccessToken(session?.accessToken);
  if (!identity || !session?.refreshToken) return { ok: false, error: 'owner_identity_rejected' };
  if (identity.sub !== expected) return { ok: false, error: 'cross_owner' };
  if (!store?.ready || store.shared !== true) return { ok: false, error: store?.error || 'link_store_not_ready' };
  const current = await store.read();
  if (current?.error) return { ok: false, error: current.error };
  if (current?.sub && String(current.sub).toLowerCase() !== expected) return { ok: false, error: 'cross_owner' };
  if (current?.phase === 'rotating' && current.rotatingUntil > Date.now()) return { ok: false, error: 'refresh_in_progress' };
  const wrote = await store.cas(current?.generation || 0, {
    sub: expected,
    refreshToken: session.refreshToken,
    accessToken: session.accessToken,
    expiresAt: session.expiresAt,
    revoked: false,
    phase: 'ready',
  });
  if (!wrote.ok && wrote.conflict) {
    const again = await store.read();
    const settled = usable(again, expected);
    if (settled) return { ok: true, linked: true };
    return { ok: false, error: again?.sub && String(again.sub).toLowerCase() !== expected ? 'cross_owner' : 'conflict' };
  }
  if (!wrote.ok) return { ok: false, error: wrote.error || 'conflict' };
  return { ok: true, linked: true };
}

export async function revokeOwnerLink(store) {
  if (!store?.ready || store.shared !== true) return { ok: false, error: store?.error || 'link_store_not_ready' };
  const current = await store.read();
  if (current?.error) return { ok: false, error: current.error };
  if (!current) return { ok: true, revoked: false };
  const wrote = await store.cas(current.generation || 0, {
    sub: current.sub,
    refreshToken: '',
    accessToken: '',
    expiresAt: 0,
    revoked: true,
    phase: 'revoked',
  });
  if (!wrote.ok) return { ok: false, error: wrote.error || 'conflict' };
  return { ok: true, revoked: true };
}

export async function accessFromOwnerLink({ store, env = process.env, fetchImpl = fetch, now = Date.now(), leaseMs = LEASE_MS, wait = () => delay(15) }) {
  if (!ownerLinkEnabled(env)) return { ok: false, skipped: true, error: 'owner_link_off' };
  const expected = expectedOwnerSub(env);
  if (!expected) return { ok: false, error: 'owner_sub_not_configured' };
  if (!store?.ready || store.shared !== true) return { ok: false, error: store?.error || 'link_store_not_ready' };
  const project = describeJrlProject(env);
  if (!project.configured) return { ok: false, error: 'not_configured' };
  const current = await store.read();
  const probe = current?.probe || null;
  if (current?.probe) delete current.probe;
  if (current?.error) return { ok: false, error: current.error, probe };
  if (current?.missing || !current || current.revoked || !current.refreshToken || !current.sub) {
    return { ok: false, error: 'not_linked', probe };
  }
  if (String(current.sub).toLowerCase() !== expected) {
    await store.cas(current.generation || 0, {
      sub: current.sub,
      refreshToken: '',
      accessToken: '',
      expiresAt: 0,
      revoked: true,
      phase: 'revoked',
    });
    return { ok: false, error: 'cross_owner' };
  }
  if (current.phase === 'rotating' && current.rotatingUntil > now) {
    const settled = usable(await waitForReady(store, wait), expected);
    if (settled) return settled;
    return { ok: false, error: 'refresh_in_progress', kept: true };
  }
  if (current.phase !== 'rotating' && current.expiresAt - 60_000 > now && current.accessToken) {
    const ready = usable(current, expected);
    if (!ready) return { ok: false, error: 'cross_owner', probe };
    return { ...ready, probe };
  }
  const basis = await store.read();
  if (basis?.error) return { ok: false, error: basis.error };
  if (!basis || basis.revoked || !basis.refreshToken) return { ok: false, error: 'not_linked' };
  if (basis.phase === 'rotating' && basis.rotatingUntil > now) {
    const settled = usable(await waitForReady(store, wait), expected);
    if (settled) return settled;
    return { ok: false, error: 'refresh_in_progress', kept: true };
  }
  const claimed = await store.cas(basis.generation || 0, {
    ...keptToken(basis),
    phase: 'rotating',
    rotatingUntil: now + leaseMs,
  });
  if (!claimed.ok) {
    const settled = usable(await waitForReady(store, wait), expected);
    if (settled) return settled;
    return { ok: false, error: 'refresh_in_progress', kept: true };
  }
  let refreshed;
  try {
    refreshed = await refreshJrlSession({ refreshToken: basis.refreshToken }, env, fetchImpl);
  } catch {
    await store.cas(claimed.record.generation, keptToken(basis));
    return { ok: false, error: 'refresh_unavailable', kept: true };
  }
  if (!refreshed.ok) {
    if (refreshed.error === 'invalid') {
      const again = await store.read();
      const settled = again && again.generation !== claimed.record.generation ? usable(again, expected) : null;
      if (settled) return settled;
      await store.cas(claimed.record.generation, {
        sub: expected,
        refreshToken: '',
        accessToken: '',
        expiresAt: 0,
        revoked: true,
        phase: 'revoked',
      });
      return { ok: false, error: 'revoked', expired: true };
    }
    await store.cas(claimed.record.generation, keptToken(basis));
    return { ok: false, error: 'refresh_unavailable', kept: true };
  }
  const identity = subjectFromAccessToken(refreshed.session.accessToken);
  if (!identity || identity.sub !== expected) {
    await store.cas(claimed.record.generation, {
      sub: expected,
      refreshToken: '',
      accessToken: '',
      expiresAt: 0,
      revoked: true,
      phase: 'revoked',
    });
    return { ok: false, error: 'cross_owner' };
  }
  const wrote = await store.cas(claimed.record.generation, {
    sub: expected,
    refreshToken: refreshed.session.refreshToken,
    accessToken: refreshed.session.accessToken,
    expiresAt: refreshed.session.expiresAt,
    revoked: false,
    phase: 'ready',
  });
  if (!wrote.ok) {
    const settled = usable(await store.read(), expected);
    if (settled) return settled;
    return { ok: false, error: 'conflict', kept: true };
  }
  return { ok: true, accessToken: refreshed.session.accessToken, expiresAt: refreshed.session.expiresAt, refreshed: true, probe };
}
