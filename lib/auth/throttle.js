export function decideThrottle(attempts, now, { limit = 8, windowMs = 10 * 60 * 1000 } = {}) {
  const recent = (attempts || []).filter((at) => now - at < windowMs);
  return { locked: recent.length >= limit, recent: recent.length, limit };
}

const processFailures = [];

export function resetProcessThrottle() {
  processFailures.length = 0;
}

export async function loginGate({ subject, store, now = Date.now(), limit = 8 }) {
  const since = now - 10 * 60 * 1000;
  const fromStore = store ? await store.failures(subject, since) : processFailures.filter((item) => item.subject === subject && item.at >= since);
  const decision = decideThrottle(fromStore.map((item) => item.at), now, { limit });
  return { ...decision, durable: Boolean(store) };
}

export async function noteLoginFailure({ subject, store, now = Date.now() }) {
  if (store) {
    await store.addFailure(subject, now);
    return;
  }
  processFailures.push({ subject, at: now });
}

const PIN_WINDOW_MS = 15 * 60 * 1000;
const PIN_IP_LIMIT = 5;
const PIN_GLOBAL_LIMIT = 20;

function recentAt(attempts, now, windowMs) {
  return (attempts || []).map((item) => (typeof item === 'number' ? item : item.at)).filter((at) => Number.isFinite(at) && now - at < windowMs);
}

export function decidePinThrottle({ ip = [], global = [], now = Date.now() } = {}) {
  const ipBurst = recentAt(ip, now, PIN_WINDOW_MS);
  const globalBurst = recentAt(global, now, PIN_WINDOW_MS);
  const over = Math.max(0, ipBurst.length - PIN_IP_LIMIT);
  const retryAfterMs = ipBurst.length >= PIN_IP_LIMIT
    ? Math.min(60 * 60 * 1000, PIN_WINDOW_MS * (2 ** Math.min(over, 2)))
    : 0;
  const newest = ipBurst.length ? Math.max(...ipBurst) : 0;
  const ipLocked = ipBurst.length >= PIN_IP_LIMIT && now < newest + retryAfterMs;
  const globalLocked = globalBurst.length >= PIN_GLOBAL_LIMIT;
  return {
    locked: ipLocked || globalLocked,
    retryAfterMs: globalLocked ? PIN_WINDOW_MS : retryAfterMs,
    ipCount: ipBurst.length,
    globalCount: globalBurst.length,
  };
}

export async function pinGate({ subject, store, now = Date.now() }) {
  const since = now - 60 * 60 * 1000;
  const ipSubject = `pin:${subject}`;
  const read = async (name) => {
    if (store) return store.failures(name, since);
    return processFailures.filter((item) => item.subject === name && item.at >= since);
  };
  const ip = await read(ipSubject);
  const global = await read('pin:global');
  return { ...decidePinThrottle({ ip, global, now }), durable: Boolean(store) };
}

export async function notePinFailure({ subject, store, now = Date.now() }) {
  await noteLoginFailure({ subject: `pin:${subject}`, store, now });
  await noteLoginFailure({ subject: 'pin:global', store, now });
}
