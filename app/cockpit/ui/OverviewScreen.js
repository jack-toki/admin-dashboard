'use client';

import { formatPounds } from '../../../lib/money';
import { moneySaved } from '../../../lib/automations/savings';

function pounds(minor) {
  if (minor == null || !Number.isFinite(minor)) return 'Missing';
  return formatPounds(minor);
}

export function OverviewScreen({ forecast, details = [], jrl, runs, outstanding = [], auto = [], onOpen }) {
  const month = new Date().toISOString().slice(0, 7);
  const rows = forecast?.rows || [];
  const income = rows.filter((row) => row.kind === 'revenue').reduce((sum, row) => sum + (row.cells?.[month]?.minor || 0), 0);
  const costs = rows.filter((row) => row.kind === 'cost').reduce((sum, row) => sum + (row.cells?.[month]?.minor || 0), 0);
  const knownIncome = rows.some((row) => row.kind === 'revenue' && row.cells?.[month] && !row.cells[month].blank);
  const ytdIncome = rows.filter((row) => row.kind === 'revenue').reduce((sum, row) => sum + Object.entries(row.cells || {}).filter(([key]) => key <= month).reduce((inner, [, cell]) => inner + (cell.minor || 0), 0), 0);
  const nextRetainer = (details || []).find((row) => row.kind === 'retainer' && !row.deletedAt);
  const entries = jrl?.body?.entries || [];
  const latest = entries.at?.(-1) || entries[entries.length - 1];
  const posts = runs?.posts;
  const saved = moneySaved({ runs: posts || 0, minutes: 7, hourlyRate: 50 });
  const openCount = outstanding.length + auto.length;
  return (
    <section className="overview-grid" aria-label="Overview">
      <button type="button" className="card glass overview-card" onClick={() => onOpen('toki')}>
        <h2>Toki</h2>
        <p><span>Income</span><b>{knownIncome ? pounds(income) : 'Missing'}</b></p>
        <p><span>Costs</span><b>{pounds(costs)}</b></p>
        <p><span>Profit</span><b>{knownIncome ? pounds(income - costs) : 'Missing'}</b></p>
        <p><span>Year to date</span><b>{pounds(ytdIncome)}</b></p>
        <p><span>Next retainer</span><b>{nextRetainer?.party || 'None'}</b></p>
        <p><span>Outstanding</span><b>{openCount}</b></p>
      </button>
      <button type="button" className="card glass overview-card" onClick={() => onOpen('jrl')}>
        <h2>JRL</h2>
        <p><span>Latest month</span><b>{latest?.period || 'None'}</b></p>
        <p><span>Net</span><b>{latest ? `£${Math.round(latest.net_total || 0).toLocaleString('en-GB')}` : 'Missing'}</b></p>
        <p><span>Ledger</span><b>{latest ? 'In' : 'Missing'}</b></p>
        <p><span>Outstanding</span><b>{auto.filter((task) => task.taskKey === 'jrl-month' || task.taskKey === 'pots-stale').length}</b></p>
      </button>
      <button type="button" className="card glass overview-card" onClick={() => onOpen('automations')}>
        <h2>Automations</h2>
        <p><span>Posts</span><b>{posts == null ? 'Missing' : posts}</b></p>
        <p><span>Time saved</span><b>{posts == null ? 'Missing' : `${saved.hours.toFixed(1)} h`}</b></p>
        <p><span>£ saved</span><b>{posts == null ? 'Missing' : `£${saved.pounds.toLocaleString('en-GB')}`}</b></p>
        <p className="sub" title={saved.formula}>{saved.formula}</p>
      </button>
    </section>
  );
}
