import fs from 'fs';
import path from 'path';
import { decryptToken, encryptToken } from '../xero/oauth.js';

function empty() {
  return { plans: [], incomeDetails: [], outstanding: [], workflows: [], events: [], tokens: [], nonces: [], failures: [], access: [], baseline: [], evidence: null };
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
    listIncomeDetails() {
      return read().incomeDetails || [];
    },
    saveIncomeDetail(record) {
      const data = read();
      data.incomeDetails = data.incomeDetails || [];
      const row = { ...record, layer: 'detail', version: 1, updatedAt: new Date().toISOString() };
      const index = data.incomeDetails.findIndex((item) => item.id === row.id);
      if (index >= 0) data.incomeDetails[index] = row;
      else data.incomeDetails.push(row);
      write(data);
      return row;
    },
    listOutstanding() {
      return (read().outstanding || []).filter((item) => !item.doneAt);
    },
    saveOutstanding(item) {
      const data = read();
      data.outstanding = data.outstanding || [];
      const row = { ...item, doneAt: item.doneAt || null, updatedAt: new Date().toISOString() };
      const index = data.outstanding.findIndex((entry) => entry.id === row.id);
      if (index >= 0) data.outstanding[index] = row;
      else data.outstanding.push(row);
      write(data);
      return row;
    },
    completeOutstanding(id) {
      const data = read();
      const row = (data.outstanding || []).find((entry) => entry.id === id && !entry.doneAt);
      if (!row) return { done: false, id };
      row.doneAt = new Date().toISOString();
      row.updatedAt = row.doneAt;
      write(data);
      return { done: true, id };
    },
    listDismissals() { return read().dismissals || []; },
    saveDismissal(row) {
      const data = read();
      data.dismissals = data.dismissals || [];
      const next = { ...row, dismissedAt: new Date().toISOString() };
      const index = data.dismissals.findIndex((item) => item.id === next.id);
      if (index >= 0) data.dismissals[index] = next;
      else data.dismissals.push(next);
      write(data);
      return next;
    },
    listRates() { return read().rates || []; },
    saveRate(row) {
      const data = read();
      data.rates = data.rates || [];
      const next = { ...row, updatedAt: new Date().toISOString() };
      const index = data.rates.findIndex((item) => item.id === next.id);
      if (index >= 0) data.rates[index] = next;
      else data.rates.push(next);
      write(data);
      return next;
    },
    readSyncState(cellKey) {
      return (read().syncState || []).find((row) => row.cellKey === cellKey) || null;
    },
    saveSyncState(row) {
      const data = read();
      data.syncState = data.syncState || [];
      const index = data.syncState.findIndex((item) => item.cellKey === row.cellKey);
      if (index >= 0) data.syncState[index] = row;
      else data.syncState.push(row);
      write(data);
      return row;
    },
    appendSheetLog(row) {
      const data = read();
      data.sheetLog = data.sheetLog || [];
      data.sheetLog.push(row);
      write(data);
      return row;
    },
    deleteIncomeDetail(id) {
      const data = read();
      const before = (data.incomeDetails || []).length;
      data.incomeDetails = (data.incomeDetails || []).filter((row) => row.id !== id);
      if (data.incomeDetails.length === before) return { deleted: false, id };
      write(data);
      return { deleted: true, id };
    },
    readAccessPin() {
      const hash = read().jrlAccessPin || null;
      return { ok: true, enabled: Boolean(hash), hash };
    },
    saveAccessPin(hash) {
      const data = read();
      data.jrlAccessPin = hash || null;
      write(data);
      return { ok: true, enabled: Boolean(hash) };
    },
    readCockpitPin() {
      return { ok: true, hash: read().cockpitPin || '' };
    },
    saveCockpitPin(hash) {
      const data = read();
      data.cockpitPin = hash || '';
      write(data);
      return { ok: true };
    },
    readPotRecord() {
      return read().jrlPots || null;
    },
    savePotRecord(record) {
      const data = read();
      data.jrlPots = { ...record, updatedAt: new Date().toISOString() };
      write(data);
      return data.jrlPots;
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
      if (provider === 'jrl') {
        const error = new Error('jrl_requires_generation');
        error.code = 'jrl_requires_generation';
        throw error;
      }
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
    readToken({ provider, tenantKey }) {
      const row = read().tokens.find((item) => item.provider === provider && item.tenantKey === tenantKey);
      if (!row) return null;
      const decoded = decryptToken(row.ciphertext, env);
      if (!decoded.ok) return null;
      return { ...decoded.payload, generation: decoded.payload.generation || 0 };
    },
    compareAndSwapToken({ provider, tenantKey, expectedGeneration, payload }) {
      const data = read();
      const index = data.tokens.findIndex((item) => item.provider === provider && item.tenantKey === tenantKey);
      let currentGeneration = 0;
      if (index >= 0) {
        const decoded = decryptToken(data.tokens[index].ciphertext, env);
        currentGeneration = decoded.ok ? (decoded.payload.generation || 0) : 0;
      }
      if (currentGeneration !== expectedGeneration) return { ok: false, conflict: true };
      const next = { ...payload, generation: expectedGeneration + 1 };
      const enc = encryptToken(next, env);
      if (!enc.ok) return enc;
      const row = { provider, tenantKey, ciphertext: enc.ciphertext, updatedAt: new Date().toISOString() };
      if (index >= 0) data.tokens[index] = row;
      else data.tokens.push(row);
      write(data);
      return { ok: true, record: next };
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
