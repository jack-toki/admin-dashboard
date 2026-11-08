import fs from 'fs';
import path from 'path';
import { decryptToken, encryptToken } from '../xero/oauth.js';

function empty() {
  return { plans: [], workflows: [], events: [], tokens: [], nonces: [], failures: [], access: [], baseline: [], evidence: null };
}

export function openFileStore(filePath, env) {
  function read() {
    if (!fs.existsSync(filePath)) return empty();
    const decoded = decryptToken(fs.readFileSync(filePath, 'utf8'), env);
    if (!decoded.ok) throw new Error('store_unreadable');
    return { ...empty(), ...decoded.payload };
  }
  function write(data) {
    const enc = encryptToken(data, env);
    if (!enc.ok) throw new Error(enc.error);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, enc.ciphertext);
    fs.renameSync(tmp, filePath);
  }
  return {
    backend: 'file',
    shared: false,
    listPlans() {
      return read().plans.filter((row) => row.area === 'toki');
    },
    savePlan(entry) {
      const data = read();
      const row = { ...entry, area: 'toki', updatedAt: new Date().toISOString() };
      const index = data.plans.findIndex((item) => item.id === row.id);
      if (index >= 0) data.plans[index] = row;
      else data.plans.push(row);
      write(data);
      return row;
    },
    deletePlan(id) {
      const data = read();
      const before = data.plans.length;
      data.plans = data.plans.filter((row) => row.id !== id);
      if (data.plans.length === before) return { deleted: false, id };
      write(data);
      return { deleted: true, id };
    },
    listBaseline() {
      return read().baseline || [];
    },
    saveBaseline(cells) {
      const data = read();
      data.baseline = data.baseline || [];
      const byId = new Map(data.baseline.map((row) => [row.id, row]));
      let created = 0;
      let updated = 0;
      for (const cell of cells) {
        if (byId.has(cell.id)) updated += 1;
        else created += 1;
        byId.set(cell.id, { ...cell, isActual: false, provenance: 'forecast_baseline' });
      }
      data.baseline = [...byId.values()];
      write(data);
      return { created, updated, cells: data.baseline };
    },
    listEvidence() {
      return read().evidence || null;
    },
    saveEvidence(evidence) {
      const data = read();
      data.evidence = evidence;
      data.baseline = data.baseline || [];
      write(data);
      return evidence;
    },
    listAccess() {
      return read().access || [];
    },
    upsertAccess(record) {
      const data = read();
      data.access = data.access || [];
      const index = data.access.findIndex((item) => item.zapierAccountId === record.zapierAccountId);
      if (index >= 0) data.access[index] = { ...data.access[index], ...record };
      else data.access.push(record);
      write(data);
      return record;
    },
    workflowsForZap(zapId) {
      return read().workflows.filter((item) => item.zapId === zapId);
    },
    upsertWorkflow(record) {
      const data = read();
      const key = `${record.accountSlug}::${record.zapId}`;
      const existing = data.workflows.find((item) => item.key === key);
      if (existing) return { created: false, record: existing };
      const row = { ...record, key };
      data.workflows.push(row);
      write(data);
      return { created: true, record: row };
    },
    insertEvent(event) {
      const data = read();
      if (data.events.some((item) => item.eventId === event.eventId)) return { deduped: true, event };
      data.events.push(event);
      write(data);
      return { deduped: false, event };
    },
    saveToken({ provider, tenantKey, payload }) {
      const enc = encryptToken(payload, env);
      if (!enc.ok) throw new Error(enc.error);
      const data = read();
      const row = { provider, tenantKey, ciphertext: enc.ciphertext, updatedAt: new Date().toISOString() };
      const index = data.tokens.findIndex((item) => item.provider === provider && item.tenantKey === tenantKey);
      if (index >= 0) data.tokens[index] = row;
      else data.tokens.push(row);
      write(data);
      return { ok: true };
    },
    consumeNonce(nonce) {
      const data = read();
      if (data.nonces.includes(nonce)) return false;
      data.nonces.push(nonce);
      write(data);
      return true;
    },
    addFailure(subject, at) {
      const data = read();
      data.failures.push({ subject, at });
      write(data);
    },
    failures(subject, since) {
      return read().failures.filter((item) => item.subject === subject && item.at >= since);
    },
  };
}
