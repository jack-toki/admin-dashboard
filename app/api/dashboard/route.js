import { db } from '../../../lib/supabase';
import { buildDashboard } from '../../../lib/aggregate';
import { readRateRows } from '../../../lib/cockpit/rates';
import { rangeWindow } from '../../../lib/automations/range';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function windowFor(period, now = new Date()) {
  const window = rangeWindow(period, now);
  return { from: window.from, to: window.to };
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
  const rates = await readRateRows();
  const dashboard = buildDashboard(rows, sheet, { period, from: from.toISOString(), to: to.toISOString() }, rates);
  return Response.json(dashboard);
}
