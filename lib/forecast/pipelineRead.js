import { serviceAccount, fetchServiceToken, readNamedRange, readNamedCell, writeNamedCell } from '../google/sheets.js';
import { PIPELINE_RANGE, PIPELINE_TAB, parsePipelinePlan, findPipelineCell, preparePipelineWrite } from './pipelinePlan.js';

export async function readPipelinePlan(env = process.env, fetchImpl = fetch) {
  const account = serviceAccount(env);
  if (!account) return { ok: false, configured: false, reason: 'not_configured' };
  const token = await fetchServiceToken(account, fetchImpl);
  if (!token) return { ok: false, configured: true, reason: 'token' };
  const values = await readNamedRange(account, token, PIPELINE_RANGE, 'FORMATTED_VALUE', fetchImpl);
  const formulas = await readNamedRange(account, token, PIPELINE_RANGE, 'FORMULA', fetchImpl);
  if (!values.ok || !formulas.ok) return { ok: false, configured: true, reason: 'sheet_unreadable' };
  return { ok: true, configured: true, plan: parsePipelinePlan(values.grid, formulas.grid) };
}

export async function writePipelineCell({ env = process.env, plan, a1, minor, stored, clear = false, fetchImpl = fetch, log }) {
  const cell = findPipelineCell(plan, a1);
  const account = serviceAccount(env);
  if (!account) return { status: 'not_configured' };
  if (!cell) return { status: 'unmapped' };
  const token = await fetchServiceToken(account, fetchImpl);
  if (!token) return { status: 'error', reason: 'token' };
  const range = `'${PIPELINE_TAB}'!${a1}`;
  const current = await readNamedCell(account, token, range, fetchImpl);
  if (!current.ok) return { status: 'error', reason: current.reason };
  const decision = preparePipelineWrite(cell, { current: current.value, stored, next: clear ? '' : minor, clear });
  if (typeof log === 'function') {
    await log({
      id: `log_${Date.now().toString(36)}_${a1}`,
      cellKey: `pipeline:${a1}`,
      sourceCell: a1,
      previousValue: current.value,
      writtenValue: decision.action === 'write' ? decision.next : null,
      action: decision.action,
      reason: decision.reason,
    });
  }
  if (decision.action !== 'write') return { status: decision.action, reason: decision.reason, cell: a1 };
  const written = await writeNamedCell(account, token, range, decision.next, fetchImpl);
  if (!written.ok) return { status: 'error', reason: written.reason, cell: a1 };
  return { status: 'written', cell: a1, value: decision.next };
}
