import { CONFIG } from '../aggregate.js';
import { COVERAGE_SNAPSHOT } from './coverage.js';
import { accountLabel } from '../supabase.js';

// Counts each logged post. A repeated post is not removed, and a zap id is not a run id.
// The registry export stays a separate fact. No posts does not mean a Zap failed.

export function summariseRuns(rows, coverage = COVERAGE_SNAPSHOT) {
  const list = Array.isArray(rows) ? rows : [];
  const byAccount = new Map();
  let latest = null;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let postsLast7Days = 0;
  for (const row of list) {
    const slug = String(row?.account || '').trim() || 'unknown';
    const current = byAccount.get(slug) || { slug, name: accountLabel(slug), runs: 0, zapIds: new Set(), latest: null };
    current.runs += 1;
    if (row?.zap_id) current.zapIds.add(String(row.zap_id));
    if (row?.ts && (!current.latest || String(row.ts) > current.latest)) current.latest = String(row.ts);
    if (row?.ts && (!latest || String(row.ts) > latest)) latest = String(row.ts);
    const when = Date.parse(row?.ts || '');
    if (Number.isFinite(when) && when >= weekAgo) postsLast7Days += 1;
    byAccount.set(slug, current);
  }
  const accountRows = [...byAccount.values()].map((item) => ({
    slug: item.slug,
    name: item.name,
    runs: item.runs,
    automations: item.zapIds.size,
    latest: item.latest,
  })).sort((a, b) => b.runs - a.runs || a.name.localeCompare(b.name));
  const posts = list.length;
  const hours = (posts * CONFIG.estMinutesPerRun) / 60;
  return {
    source: 'public.runs',
    mutated: false,
    deduped: false,
    posts,
    postsLast7Days,
    accounts: accountRows.length,
    automations: accountRows.reduce((sum, item) => sum + item.automations, 0),
    latest,
    accountRows,
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
