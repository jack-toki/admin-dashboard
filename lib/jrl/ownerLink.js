// Off until JRL_OWNER_LINK=on. A cockpit passcode does not open the ledger before that,
// and even then only a stored owner session is used. The service role is never read.
// Anyone who can pass the cockpit passcode can use the linked owner session.
// That is one shared secret, not a separate person.

import { describeJrlProject, refreshJrlSession } from './session.js';

export const OWNER_LINK_RISK = 'Anyone who can pass the cockpit passcode can read and write the JRL ledger as the linked owner. The passcode is one shared secret, not a separate person.';

const queues = new Map();

export function ownerLinkEnabled(env = process.env) {
  return env.JRL_OWNER_LINK === 'on';
}

export function subjectFromAccessToken(token) {
  const part = String(token || '').split('.')[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    if (!payload?.sub || payload.role === 'anon' || payload.role === 'service_role') return null;
    if (payload.role && payload.role !== 'authenticated') return null;
    return { sub: String(payload.sub) };
  } catch {
    return null;
  }
}

export function memoryOwnerStore() {
  let row = null;
  return {
    ready: true,
    async read() {
      return row ? { ...row } : null;
    },
    async cas(expectedGeneration, record) {
      const current = row?.generation || 0;
      if (current !== expectedGeneration) return { ok: false, conflict: true, record: row ? { ...row } : null };
      row = { ...record, generation: expectedGeneration + 1 };
      return { ok: true, record: { ...row } };
    },
  };
}

export function ownerLinkStore(store) {
  if (!store || store.backend !== 'file' || typeof store.readToken !== 'function' || typeof store.compareAndSwapToken !== 'function') {
    return { ready: false, error: 'link_store_not_ready' };
  }
  return {
    ready: true,
    async read() {
      return store.readToken({ provider: 'jrl', tenantKey: 'owner' });
    },
    async cas(expectedGeneration, record) {
      return store.compareAndSwapToken({
        provider: 'jrl',
        tenantKey: 'owner',
        expectedGeneration,
        payload: record,
      });
    },
  };
}

function serial(key, fn) {
  const previous = queues.get(key) || Promise.resolve();
  const run = previous.then(fn, fn);
  queues.set(key, run.then(() => {}, () => {}));
  return run;
}

export async function establishOwnerLink({ store, session, env = process.env }) {
  if (!ownerLinkEnabled(env)) return { ok: false, skipped: true };
  if (!store?.ready) return { ok: false, error: 'link_store_not_ready' };
  const identity = subjectFromAccessToken(session?.accessToken);
  if (!identity || !session?.refreshToken) return { ok: false, error: 'owner_identity_rejected' };
  return serial('jrl-owner', async () => {
    const current = await store.read();
    if (current?.sub && current.sub !== identity.sub) return { ok: false, error: 'cross_owner' };
    const wrote = await store.cas(current?.generation || 0, {
      sub: identity.sub,
      refreshToken: session.refreshToken,
      accessToken: session.accessToken,
      expiresAt: session.expiresAt,
      revoked: false,
    });
    if (!wrote.ok && wrote.conflict) {
      const again = await store.read();
      if (again?.sub === identity.sub && !again.revoked) return { ok: true, linked: true, sub: identity.sub };
      return { ok: false, error: again?.sub && again.sub !== identity.sub ? 'cross_owner' : 'conflict' };
    }
    return wrote.ok ? { ok: true, linked: true, sub: identity.sub } : wrote;
  });
}

export async function revokeOwnerLink(store) {
  if (!store?.ready) return { ok: false, error: 'link_store_not_ready' };
  return serial('jrl-owner', async () => {
    const current = await store.read();
    if (!current) return { ok: true, revoked: false };
    return store.cas(current.generation || 0, {
      ...current,
      revoked: true,
      refreshToken: '',
      accessToken: '',
    });
  });
}

export async function accessFromOwnerLink({ store, env = process.env, fetchImpl = fetch, now = Date.now() }) {
  if (!ownerLinkEnabled(env)) return { ok: false, skipped: true };
  if (!store?.ready) return { ok: false, error: 'link_store_not_ready' };
  const project = describeJrlProject(env);
  if (!project.configured) return { ok: false, error: 'not_configured' };
  return serial('jrl-owner', async () => {
    const current = await store.read();
    if (!current || current.revoked || !current.refreshToken || !current.sub) return { ok: false, error: 'not_linked' };
    if (current.expiresAt - 60_000 > now && current.accessToken) {
      const identity = subjectFromAccessToken(current.accessToken);
      if (!identity || identity.sub !== current.sub) return { ok: false, error: 'cross_owner' };
      return { ok: true, accessToken: current.accessToken, expiresAt: current.expiresAt, refreshed: false };
    }
    const refreshed = await refreshJrlSession({ refreshToken: current.refreshToken }, env, fetchImpl);
    if (!refreshed.ok) {
      await store.cas(current.generation || 0, { ...current, revoked: true, refreshToken: '', accessToken: '' });
      return { ok: false, error: 'revoked', expired: true };
    }
    const identity = subjectFromAccessToken(refreshed.session.accessToken);
    if (!identity || identity.sub !== current.sub) {
      await store.cas(current.generation || 0, { ...current, revoked: true, refreshToken: '', accessToken: '' });
      return { ok: false, error: 'cross_owner' };
    }
    const wrote = await store.cas(current.generation || 0, {
      sub: current.sub,
      refreshToken: refreshed.session.refreshToken,
      accessToken: refreshed.session.accessToken,
      expiresAt: refreshed.session.expiresAt,
      revoked: false,
    });
    if (!wrote.ok) {
      const again = await store.read();
      if (again && !again.revoked && again.sub === current.sub && again.accessToken) {
        return { ok: true, accessToken: again.accessToken, expiresAt: again.expiresAt, refreshed: false };
      }
      return { ok: false, error: 'conflict' };
    }
    return { ok: true, accessToken: refreshed.session.accessToken, expiresAt: refreshed.session.expiresAt, refreshed: true };
  });
}
