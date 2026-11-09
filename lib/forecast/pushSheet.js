import { serviceAccount, fetchServiceToken, readCell, writeCell } from '../google/sheets.js';
import { decideSheetWrite, findForecastInput, poundsFromMinor } from './sheetSync.js';

export async function pushForecastValue({ store, env = process.env, label, month, minor, fetchImpl = fetch }) {
  const account = serviceAccount(env);
  if (!account) return { status: 'not_configured' };
  if (!store || typeof store.listBaseline !== 'function') return { status: 'not_configured' };
  const cells = await store.listBaseline();
  const match = findForecastInput(cells, { label, month });
  if (!match) return { status: 'unmapped', reason: 'no_input_cell' };
  const a1 = match.sourceCell || match.source_cell;
  const token = await fetchServiceToken(account, fetchImpl);
  if (!token) return { status: 'error', reason: 'token' };
  const current = await readCell(account, token, a1, fetchImpl);
  if (!current.ok) return { status: 'error', reason: current.reason };
  const synced = typeof store.readSyncState === 'function' ? await store.readSyncState(`${label}:${month}`) : null;
  const stored = poundsFromMinor(match.enteredMinor ?? match.amountMinor);
  const next = poundsFromMinor(minor);
  const decision = decideSheetWrite({
    current: current.value,
    lastSynced: synced?.lastValue ?? null,
    stored,
    next,
  });
  const log = {
    id: `log_${Date.now().toString(36)}_${a1}`,
    cellKey: `${label}:${month}`,
    sourceCell: a1,
    previousValue: current.value,
    writtenValue: decision.action === 'write' ? next : null,
    action: decision.action,
    reason: decision.reason,
  };
  if (typeof store.appendSheetLog === 'function') await store.appendSheetLog(log);
  if (decision.action !== 'write') return { status: decision.action, reason: decision.reason, cell: a1, current: decision.current, lastSynced: decision.lastSynced };
  const written = await writeCell(account, token, a1, next, fetchImpl);
  if (!written.ok) return { status: 'error', reason: written.reason, cell: a1 };
  if (typeof store.saveSyncState === 'function') {
    await store.saveSyncState({ cellKey: `${label}:${month}`, sourceCell: a1, lastValue: next });
  }
  return { status: 'written', cell: a1, value: next };
}
