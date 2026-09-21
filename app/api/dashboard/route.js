import { db } from '../../../lib/supabase';
import { buildDashboard } from '../../../lib/aggregate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function windowFor(period) {
  const now = new Date();
  const y = now.getUTCFullYear(), m = now.getUTCMonth(), d = now.getUTCDate();
  if (period === 'today') {
    return { from: new Date(Date.UTC(y, m, d)), to: now };
  }
  if (period === 'this-week') {
    const day = now.getUTCDay();
    const daysToMon = (day === 0) ? 6 : day - 1;
    const mon = new Date(Date.UTC(y, m, d - daysToMon));
    return { from: mon, to: now };
  }
  if (period === 'last-month') {
    return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
  }
  if (period === '90-days') {
    return { from: new Date(now.getTime() - 90 * 864e5), to: now };
  }
  if (period === 'all-time') {
    return { from: new Date(Date.UTC(2000, 0, 1)), to: now };
  }
  return { from: new Date(Date.UTC(y, m, 1)), to: now };
}

let sheetCache = { text: '', at: 0 };
async function getSheet() {
  const url = process.env.SHEET_CSV_URL;
  if (!url) return '';
  if (Date.now() - sheetCache.at < 60_000 && sheetCache.text) return sheetCache.text;
  try {
    const res = await fetch(url);
    const text = await res.text();
    sheetCache = { text, at: Date.now() };
    return text;
  } catch { return sheetCache.text || ''; }
}

export async function GET(req) {
  const period = new URL(req.url).searchParams.get('period') || 'this-month';
  const { from, to } = windowFor(period);
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db()
      .from('runs')
      .select('account,zap_id,zap_title,ts,counts')
      .gte('ts', from.toISOString())
      .lt('ts', to.toISOString())
      .order('ts', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  const sheet = await getSheet();
  const dashboard = buildDashboard(rows, sheet, { period, from: from.toISOString(), to: to.toISOString() });
  return Response.json(dashboard);
}
