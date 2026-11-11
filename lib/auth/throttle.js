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
