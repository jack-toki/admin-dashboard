'use client';

import { useEffect, useState } from 'react';
import { formatPounds } from '../../../lib/money';
import { deriveLedger } from '../../../lib/jrl/finance';
import { savingsFromZaps } from '../../../lib/automations/savings';

function shown(minor) {
  if (minor == null || !Number.isFinite(minor)) return '—';
  return formatPounds(minor);
}

function Spark({ points }) {
  const values = (points || []).map((point) => point.value).filter((value) => Number.isFinite(value));
  if (values.length < 2) return <div className="spark empty" aria-hidden="true" />;
  const max = Math.max(...values.map((value) => Math.abs(value)), 1);
  return (
    <div className="spark" aria-hidden="true">
      {points.map((point) => (
        <i key={point.id} style={{ height: Number.isFinite(point.value) ? `${Math.max(8, Math.round((Math.abs(point.value) / max) * 100))}%` : '8%' }} />
      ))}
    </div>
  );
}

export function OverviewScreen({ forecast, details = [], jrl, runs, outstanding = [], auto = [], onOpen }) {
  const [rates, setRates] = useState([]);
  useEffect(() => {
    let cancel = false;
    fetch('/api/cockpit/rates').then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!cancel && Array.isArray(body.rows)) setRates(body.rows);
    }).catch(() => {});
    return () => { cancel = true; };
  }, []);
  const month = new Date().toISOString().slice(0, 7);
  const rows = forecast?.rows || [];
  const months = [...new Set(rows.flatMap((row) => Object.keys(row.cells || {})))].sort();
  const incomeOf = (key) => {
    const lines = rows.filter((row) => row.kind === 'revenue');
    if (!lines.some((row) => row.cells?.[key] && !row.cells[key].blank)) return null;
    return lines.reduce((sum, row) => sum + (row.cells?.[key]?.minor || 0), 0);
  };
  const costOf = (key) => rows.filter((row) => row.kind === 'cost').reduce((sum, row) => sum + (row.cells?.[key]?.minor || 0), 0);
  const income = incomeOf(month);
  const costs = rows.some((row) => row.kind === 'cost' && row.cells?.[month] && !row.cells[month].blank) ? costOf(month) : null;
  const ytd = months.filter((key) => key <= month).reduce((sum, key) => sum + (incomeOf(key) || 0), 0);
  const nextRetainer = (details || []).find((row) => row.kind === 'retainer' && !row.deletedAt);
  const ledger = deriveLedger(jrl?.body?.entries || []);
  const latest = ledger.at(-1);
  const posts = runs?.posts;
  const saved = savingsFromZaps(runs?.zapRows || [], rates);
  const openCount = outstanding.length + auto.length;
  const tokiSpark = months.map((key) => ({ id: key, value: incomeOf(key) }));
  const jrlSpark = ledger.map((row) => ({ id: row.period, value: row.net_total }));
  const autoSpark = (runs?.daily || []).map((row) => ({ id: row.day, value: row.count }));
  return (
    <section className="overview-grid" aria-label="Overview">
      <article className="card glass overview-card">
        <h2>Toki</h2>
        <div className={income == null ? 'kpi no-data' : 'kpi num'}>{income == null ? '—' : formatPounds(income)}</div>
        <p className="k">Income this month</p>
        <Spark points={tokiSpark} />
        <div className="overview-rows">
          <p><span>Costs</span><b className="num">{shown(costs)}</b></p>
          <p><span>Profit</span><b className="num">{income == null || costs == null ? '—' : formatPounds(income - costs)}</b></p>
          <p><span>Year to date</span><b className="num">{shown(ytd)}</b></p>
          <p><span>Time saved</span><b className="num">{posts == null ? '—' : `${saved.hours.toFixed(1)} h`}</b></p>
          <p><span>£ saved</span><b className="num">{posts == null ? '—' : `£${saved.pounds.toLocaleString('en-GB')}`}</b></p>
          <p><span>Next retainer</span><b>{nextRetainer?.party || '—'}</b></p>
          <p><span>Outstanding</span><b className="num">{openCount}</b></p>
        </div>
        <button type="button" className="btn" onClick={() => onOpen('toki')}>View Toki</button>
      </article>
      <article className="card glass overview-card">
        <h2>JRL</h2>
        <div className={latest ? 'kpi num' : 'kpi no-data'}>{latest ? `£${Math.round(latest.net_total || 0).toLocaleString('en-GB')}` : '—'}</div>
        <p className="k">Net {latest?.period || 'this month'}</p>
        <Spark points={jrlSpark} />
        <div className="overview-rows">
          <p><span>Ledger</span><b className="num">{latest ? `${ledger.length} ${ledger.length === 1 ? 'month' : 'months'}` : '—'}</b></p>
          <p><span>Savings</span><b className="num">{latest ? `£${Math.round(latest.savings_total || 0).toLocaleString('en-GB')}` : '—'}</b></p>
          <p><span>Outstanding</span><b className="num">{auto.filter((task) => task.taskKey === 'jrl-month' || task.taskKey === 'pots-stale').length}</b></p>
        </div>
        <button type="button" className="btn" onClick={() => onOpen('jrl')}>View JRL</button>
      </article>
      <article className="card glass overview-card">
        <h2>Automations</h2>
        <div className={posts == null ? 'kpi no-data' : 'kpi num'}>{posts == null ? '—' : posts}</div>
        <p className="k">Posts this month</p>
        <Spark points={autoSpark} />
        <div className="overview-rows">
          <p><span>Time saved</span><b className="num">{posts == null ? '—' : `${saved.hours.toFixed(1)} h`}</b></p>
          <p><span>£ saved</span><b className="num">{posts == null ? '—' : `£${saved.pounds.toLocaleString('en-GB')}`}</b></p>
          <p><span>Active Zaps</span><b className="num">{runs?.zapRows ? runs.zapRows.length : '—'}</b></p>
        </div>
        <button type="button" className="btn" onClick={() => onOpen('automations')}>View Automations</button>
      </article>
    </section>
  );
}
