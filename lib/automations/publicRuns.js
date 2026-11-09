import { CONFIG } from '../aggregate.js';
import { COVERAGE_SNAPSHOT } from './coverage.js';

// public.runs.account is the label stored at ingest, usually accountLabel(slug), not the URL slug.
// A zap id that posted is not the public “Automations live” set, and neither is an inventory of Zaps switched on.

function accountsMap(env = process.env) {
  try {
    const parsed = JSON.parse(env.ACCOUNTS || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function identifyRunAccount(stored, env = process.env) {
  const logAccount = String(stored || '').trim();
  if (!logAccount) return { logAccount: '', name: 'Unknown account', ingestSlug: null };
  const map = accountsMap(env);
  if (Object.prototype.hasOwnProperty.call(map, logAccount) && map[logAccount]) {
    return { logAccount, name: String(map[logAccount]), ingestSlug: logAccount };
  }
  const matches = Object.entries(map).filter(([, name]) => String(name) === logAccount);
  if (matches.length === 1) return { logAccount, name: logAccount, ingestSlug: matches[0][0] };
  return { logAccount, name: logAccount, ingestSlug: null };
}

export function summariseRuns(rows, coverage = COVERAGE_SNAPSHOT, env = process.env) {
  const list = Array.isArray(rows) ? rows : [];
  const byAccount = new Map();
  const byZap = new Map();
  const byDay = new Map();
  let latest = null;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let postsLast7Days = 0;
  let postsWithoutZapId = 0;
  for (const row of list) {
    const identity = identifyRunAccount(row?.account, env);
    const key = identity.logAccount || 'unknown';
    const current = byAccount.get(key) || { ...identity, runs: 0, zapIds: new Set(), postsWithoutZapId: 0, latest: null };
    current.runs += 1;
    const zapId = row?.zap_id == null ? '' : String(row.zap_id).trim();
    if (zapId) {
      current.zapIds.add(zapId);
      const zap = byZap.get(zapId) || { zapId, title: row?.zap_title || zapId, account: identity.name, runs: 0 };
      zap.runs += 1;
      if (row?.zap_title) zap.title = String(row.zap_title);
      byZap.set(zapId, zap);
    } else current.postsWithoutZapId += 1;
    if (!zapId) postsWithoutZapId += 1;
    if (row?.ts && (!current.latest || String(row.ts) > current.latest)) current.latest = String(row.ts);
    if (row?.ts && (!latest || String(row.ts) > latest)) latest = String(row.ts);
    const when = Date.parse(row?.ts || '');
    if (Number.isFinite(when) && when >= weekAgo) postsLast7Days += 1;
    if (row?.ts) {
      const day = String(row.ts).slice(0, 10);
      byDay.set(day, (byDay.get(day) || 0) + 1);
    }
    byAccount.set(key, current);
  }
  const accountRows = [...byAccount.values()].map((item) => ({
    logAccount: item.logAccount,
    name: item.name,
    ingestSlug: item.ingestSlug,
    runs: item.runs,
    reportingZapIds: item.zapIds.size,
    postsWithoutZapId: item.postsWithoutZapId,
    latest: item.latest,
  })).sort((a, b) => b.runs - a.runs || a.name.localeCompare(b.name));
  const posts = list.length;
  const reportingZapIds = accountRows.reduce((sum, item) => sum + item.reportingZapIds, 0);
  const hours = (posts * CONFIG.estMinutesPerRun) / 60;
  return {
    source: 'public.runs',
    mutated: false,
    deduped: false,
    posts,
    postsLast7Days,
    postsWithoutZapId,
    accounts: accountRows.length,
    reportingZapIds,
    reportingZapIdsMeaning: 'Distinct non-empty zap ids on posts, counted inside each account label and then added. A zap id posted under two labels is counted twice. A post with no zap id is not included. This is not the public Automations live tile, which keeps a missing zap id as one set member, and it is not a count of Zaps switched on.',
    latest,
    accountRows,
    zapRows: [...byZap.values()].sort((a, b) => b.runs - a.runs || a.title.localeCompare(b.title)),
    daily: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count })),
    estimate: {
      measured: false,
      minutesPerPost: CONFIG.estMinutesPerRun,
      hourlyRate: CONFIG.hourlyRate,
      currency: 'GBP',
      hours,
      value: Math.round(hours * CONFIG.hourlyRate),
      label: `Estimated. ${CONFIG.estMinutesPerRun} minutes per logged post at £${CONFIG.hourlyRate} an hour. Not measured time. Retries are not removed.`,
    },
    registry: {
      separateFromRunLog: true,
      jackOwnOn: coverage.jackOwnOn,
      jackReportingInExport: coverage.jackOwnOnWithIngest,
      clientOn: coverage.clientOn,
      clientOnWithIngest: coverage.clientOnWithIngest,
      otherClients: coverage.otherClients,
      note: 'The Zapier export is not this log. Jack’s own account had 0 of 43 on Zaps reporting in that export. Coverage for some clients is unknown. A missing or old post does not prove a Zap failed, and no posts is not a failure.',
    },
  };
}

export function thisMonthWindow(now = new Date()) {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { from: from.toISOString(), to: now.toISOString(), label: 'this month' };
}

export async function loadRunSummary(query, now = new Date()) {
  const period = thisMonthWindow(now);
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const page = await query({ ...period, offset, pageSize });
    if (page?.error) return { ok: false, error: 'run_log_unreadable', summary: null };
    const data = page?.data || [];
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return { ok: true, error: null, period, summary: summariseRuns(rows) };
}
