'use client';

import { useEffect, useState } from 'react';
import { formatPounds } from '../../../lib/money';
import { deriveLedger } from '../../../lib/jrl/finance';
import { incomeBreakdown, workingMonthLines, sumLines } from '../../../lib/planning/entries';
import { savingsFromZaps } from '../../../lib/automations/savings';
import {
  clientSavings,
  clientsForSegment,
  hourTicks,
  incomeYear,
  poundTicks,
  retainersEnding,
} from '../../../lib/cockpit/overview';

function poundsLabel(pounds) {
  const abs = Math.abs(pounds);
  const text = Number.isInteger(abs) ? abs.toLocaleString('en-GB') : abs.toLocaleString('en-GB', { maximumFractionDigits: 1 });
  return `${pounds < 0 ? '−' : ''}£${text}`;
}

function hoursLabel(hours) {
  const text = Number.isInteger(hours) ? String(hours) : String(Math.round(hours * 10) / 10);
  return `${text} h`;
}

function Tile({ label, value, onClick }) {
  return (
    <button type="button" className="ov-tile" onClick={onClick}>
      <span>{label}</span>
      <b className={value === '—' ? 'num no-data' : 'num'}>{value}</b>
    </button>
  );
}

function SegmentTip({ title, rows, forecast, showClients }) {
  return (
    <div className="ov-tip" role="tooltip">
      <b>{title}</b>
      {showClients && (rows.length ? rows.map((row) => (
        <p key={row.id}><span>{row.name}</span><b className="num">{row.minor == null ? '—' : formatPounds(row.minor)}</b></p>
      )) : <p className="no-data">No client lines</p>)}
      <p><span>{showClients ? 'Forecast' : 'Amount'}</span><b className="num">{forecast == null ? '—' : formatPounds(forecast)}</b></p>
    </div>
  );
}

function IncomeChart({ series, details, onOpen }) {
  const [tip, setTip] = useState(null);
  const stacked = series.map((month) => (month.retainer || 0) + (month.project || 0));
  const actuals = series.map((month) => month.actual).filter((value) => value != null);
  const scale = poundTicks(Math.max(1, ...stacked, ...actuals));
  const tipMonth = series.find((month) => month.id === tip?.id);
  const tipRows = tipMonth && tip?.kind ? clientsForSegment(details, tip.kind, tipMonth.id) : [];
  const tipValue = tip?.kind === 'retainer' ? tipMonth?.retainer : tip?.kind === 'project' ? tipMonth?.project : tipMonth?.actual;
  return (
    <div className="ov-chart" onMouseLeave={() => setTip(null)}>
      <div className="ov-legend" role="group" aria-label="Income series">
        <span><i className="swatch-retainer" />Retainer (forecast)</span>
        <span><i className="swatch-project" />Project (forecast)</span>
        <span><i className="swatch-actual" />Actual received</span>
      </div>
      <div className="ov-plot">
        <div className="ov-y" aria-hidden="true">
          {scale.ticks.map((tick) => <span key={tick}>{poundsLabel(tick)}</span>)}
        </div>
        <div className="ov-cols" role="group" aria-label="Income by month">
          {series.map((month) => (
            <div key={month.id} className="ov-col">
              <span className="ov-bars">
                <span className="col-stack ov-stack">
                  {['retainer', 'project'].map((kind) => {
                    const value = month[kind];
                    const known = value != null && Number.isFinite(value);
                    return (
                      <button
                        key={kind}
                        type="button"
                        className="ov-seg"
                        aria-label={`${month.label} ${kind === 'retainer' ? 'retainer' : 'project'} forecast`}
                        style={known && value !== 0 ? { height: `${(Math.abs(value) / scale.topMinor) * 100}%` } : undefined}
                        onMouseEnter={() => setTip({ id: month.id, kind })}
                        onFocus={() => setTip({ id: month.id, kind })}
                        onClick={() => onOpen({ area: 'toki', month: month.id, board: 'year', kind, detail: monthDetail(month, kind, details) })}
                      >
                        <i data-bar={kind} data-state={known ? (value === 0 ? 'zero' : 'value') : 'missing'} />
                      </button>
                    );
                  })}
                </span>
                <button
                  type="button"
                  className="ov-seg ov-actual"
                  style={month.actual ? { height: `${(Math.abs(month.actual) / scale.topMinor) * 100}%` } : undefined}
                  aria-label={`${month.label} actual received`}
                  onMouseEnter={() => setTip({ id: month.id, kind: 'actual' })}
                  onFocus={() => setTip({ id: month.id, kind: 'actual' })}
                  onClick={() => onOpen({ area: 'toki', month: month.id, board: 'year', detail: { title: month.label, fields: [{ label: 'Actual received', value: month.actual == null ? '—' : formatPounds(month.actual) }] } })}
                >
                  <i data-bar="actual" data-state={month.actual == null ? 'missing' : (month.actual === 0 ? 'zero' : 'value')} style={month.actual ? { height: '100%' } : undefined} />
                </button>
              </span>
              <span className="ov-x">{month.label}</span>
            </div>
          ))}
        </div>
        {tip && tipMonth ? (
          <SegmentTip
            title={`${tipMonth.label} · ${tip.kind === 'retainer' ? 'Retainer' : tip.kind === 'project' ? 'Project' : 'Actual received'}`}
            rows={tip.kind === 'actual' ? [] : tipRows}
            showClients={tip.kind !== 'actual'}
            forecast={tipValue}
          />
        ) : null}
      </div>
    </div>
  );
}

function monthDetail(month, kind, details) {
  const rows = clientsForSegment(details, kind, month.id);
  const label = kind === 'retainer' ? 'Retainer (forecast)' : 'Project (forecast)';
  return {
    title: `${month.label} ${label}`,
    fields: [
      { label: 'Forecast', value: month[kind] == null ? '—' : formatPounds(month[kind]) },
      ...rows.map((row) => ({ label: row.name, value: row.minor == null ? '—' : formatPounds(row.minor) })),
    ],
  };
}

function ClientChart({ clients, onOpen }) {
  const [tip, setTip] = useState(null);
  const scale = hourTicks(Math.max(0, ...clients.map((client) => client.hours)));
  const active = clients.find((client) => client.name === tip);
  return (
    <div className="ov-chart" onMouseLeave={() => setTip(null)}>
      <div className="ov-plot">
        <div className="ov-y" aria-hidden="true">
          {scale.ticks.map((tick) => <span key={tick}>{hoursLabel(tick)}</span>)}
        </div>
        <div className="ov-cols" role="group" aria-label="Time saved by client">
          {clients.map((client) => (
            <div key={client.name} className="ov-col">
              <span className="ov-bars">
                <button
                  type="button"
                  className="ov-seg ov-client"
                  style={client.hours ? { height: `${(client.hours / scale.top) * 100}%` } : undefined}
                  aria-label={`${client.name}, ${hoursLabel(client.hours)} saved`}
                  onMouseEnter={() => setTip(client.name)}
                  onFocus={() => setTip(client.name)}
                  onClick={() => onOpen({
                    area: 'automations',
                    detail: {
                      title: client.name,
                      fields: [
                        { label: 'Time saved', value: hoursLabel(client.hours) },
                        { label: '£ saved', value: `£${client.pounds.toLocaleString('en-GB')}` },
                        { label: 'Posts', value: String(client.runs) },
                      ],
                    },
                  })}
                >
                  <i data-bar="hours" data-state={client.hours ? 'value' : 'zero'} />
                </button>
              </span>
              <span className="ov-x" title={client.name}>{client.name}</span>
            </div>
          ))}
          {!clients.length && <p className="ov-empty">No client time this month.</p>}
        </div>
        {active ? (
          <div className="ov-tip" role="tooltip">
            <b>{active.name}</b>
            <p><span>Time saved</span><b className="num">{hoursLabel(active.hours)}</b></p>
            <p><span>£ saved</span><b className="num">£{active.pounds.toLocaleString('en-GB')}</b></p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function OverviewScreen({ forecast, plan = [], actuals = null, details = [], jrl, runs, outstanding = [], auto = [], onOpen }) {
  const [rates, setRates] = useState([]);
  useEffect(() => {
    let cancel = false;
    fetch('/api/cockpit/rates').then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!cancel && Array.isArray(body.rows)) setRates(body.rows);
    }).catch(() => {});
    return () => { cancel = true; };
  }, []);
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const year = month.slice(0, 4);
  const rows = forecast?.rows || [];
  const series = incomeYear(rows, plan, year, actuals);
  const monthLines = workingMonthLines(rows, plan, month);
  const split = incomeBreakdown(monthLines);
  const income = split.total;
  const costs = sumLines(monthLines, 'cost');
  const ytd = series.filter((item) => item.id <= month).reduce((sum, item) => sum + (item.total || 0), 0);
  const ending = retainersEnding(details, now, 3);
  const nextRetainer = (details || []).find((row) => row.kind === 'retainer' && !row.deletedAt);
  const ledger = deriveLedger(jrl?.body?.entries || []);
  const latest = ledger.at(-1);
  const posts = runs?.posts;
  const saved = savingsFromZaps(runs?.zapRows || [], rates);
  const clients = clientSavings(runs?.zapRows || [], rates);
  const openCount = outstanding.length + auto.length;
  const jrlSpark = ledger.map((row) => ({ id: row.period, value: row.net_total }));
  const openToki = (extra = {}) => onOpen?.({ area: 'toki', ...extra });
  const openAuto = (extra = {}) => onOpen?.({ area: 'automations', ...extra });
  return (
    <section className="overview-grid" aria-label="Overview">
      <article className="card glass overview-card">
        <h2>Toki</h2>
        <div className={income == null ? 'kpi no-data' : 'kpi num'}>{income == null ? '—' : formatPounds(income)}</div>
        <p className="k">Income this month</p>
        <IncomeChart series={series} details={details} onOpen={onOpen} />
        <section className="ov-ending" aria-label="Retainers ending">
          <h3>Retainers ending</h3>
          {ending.length ? ending.map((row) => (
            <button key={row.id || row.party} type="button" className="ov-end" onClick={() => openToki({
              section: 'sources',
              detail: {
                title: row.party,
                fields: [
                  { label: 'Kind', value: 'Retainer' },
                  { label: 'Amount', value: row.amountMinor == null ? '—' : formatPounds(row.amountMinor) },
                  { label: 'Contract end', value: String(row.contractEndDate).slice(0, 10) },
                ],
              },
            })}>
              <span>{row.party}</span>
              <b className="num">{new Date(`${String(row.contractEndDate).slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</b>
            </button>
          )) : <p className="no-data">None in the next 3 months.</p>}
        </section>
        <div className="ov-tiles">
          <Tile label="Costs" value={costs == null ? '—' : formatPounds(costs)} onClick={() => openToki({ month, board: 'groups', detail: { title: 'Costs', fields: [{ label: 'Month', value: month }, { label: 'Costs', value: costs == null ? '—' : formatPounds(costs) }] } })} />
          <Tile label="Profit" value={income == null || costs == null ? '—' : formatPounds(income - costs)} onClick={() => openToki({ month, detail: { title: 'Profit', fields: [{ label: 'Month', value: month }, { label: 'Profit', value: income == null || costs == null ? '—' : formatPounds(income - costs) }] } })} />
          <Tile label="Year to date" value={ytd ? formatPounds(ytd) : '—'} onClick={() => openToki({ board: 'year' })} />
          <Tile label="Time saved" value={posts == null ? '—' : hoursLabel(saved.hours)} onClick={() => openAuto()} />
          <Tile label="£ saved" value={posts == null ? '—' : `£${saved.pounds.toLocaleString('en-GB')}`} onClick={() => openAuto({ detail: { title: '£ saved', fields: clients.map((client) => ({ label: client.name, value: `£${client.pounds.toLocaleString('en-GB')}` })) } })} />
          <Tile label="Next retainer" value={nextRetainer?.party || '—'} onClick={() => openToki(nextRetainer ? { section: 'sources', detail: { title: nextRetainer.party, fields: [{ label: 'Kind', value: 'Retainer' }, { label: 'Amount', value: nextRetainer.amountMinor == null ? '—' : formatPounds(nextRetainer.amountMinor) }] } } : { section: 'sources' })} />
          <Tile label="Outstanding" value={String(openCount)} onClick={() => openToki()} />
        </div>
        <button type="button" className="btn" onClick={() => openToki()}>View Toki</button>
      </article>
      <article className="card glass overview-card">
        <h2>JRL</h2>
        <div className={latest ? 'kpi num' : 'kpi no-data'}>{latest ? `£${Math.round(latest.net_total || 0).toLocaleString('en-GB')}` : '—'}</div>
        <p className="k">Net {latest?.period || 'this month'}</p>
        <div className={jrlSpark.filter((point) => Number.isFinite(point.value)).length < 2 ? 'spark empty ov-spark' : 'spark ov-spark'} aria-hidden="true">
          {jrlSpark.filter((point) => Number.isFinite(point.value)).length >= 2 && jrlSpark.map((point) => {
            const max = Math.max(...jrlSpark.map((item) => Math.abs(item.value) || 0), 1);
            return <i key={point.id} style={{ height: Number.isFinite(point.value) ? `${Math.max(8, Math.round((Math.abs(point.value) / max) * 100))}%` : '8%' }} />;
          })}
        </div>
        <div className="ov-tiles">
          <Tile label="Ledger" value={latest ? `${ledger.length} ${ledger.length === 1 ? 'month' : 'months'}` : '—'} onClick={() => onOpen?.('jrl')} />
          <Tile label="Savings" value={latest ? `£${Math.round(latest.savings_total || 0).toLocaleString('en-GB')}` : '—'} onClick={() => onOpen?.('jrl')} />
          <Tile label="Outstanding" value={String(auto.filter((task) => task.taskKey === 'jrl-month' || task.taskKey === 'pots-stale').length)} onClick={() => onOpen?.('jrl')} />
        </div>
        <button type="button" className="btn" onClick={() => onOpen?.('jrl')}>View JRL</button>
      </article>
      <article className="card glass overview-card">
        <h2>Automations</h2>
        <div className={posts == null ? 'kpi no-data' : 'kpi num'}>{posts == null ? '—' : hoursLabel(saved.hours)}</div>
        <p className="k">Time saved</p>
        <ClientChart clients={clients} onOpen={onOpen} />
        <div className="ov-tiles">
          <Tile label="Time saved" value={posts == null ? '—' : hoursLabel(saved.hours)} onClick={() => openAuto()} />
          <Tile label="£ saved" value={posts == null ? '—' : `£${saved.pounds.toLocaleString('en-GB')}`} onClick={() => openAuto({ detail: { title: '£ saved', fields: clients.map((client) => ({ label: client.name, value: `£${client.pounds.toLocaleString('en-GB')}` })) } })} />
          <Tile label="Active Zaps" value={runs?.zapRows ? String(runs.zapRows.length) : '—'} onClick={() => openAuto()} />
          <Tile label="Posts" value={posts == null ? '—' : String(posts)} onClick={() => openAuto()} />
        </div>
        <button type="button" className="btn" onClick={() => openAuto()}>View Automations</button>
      </article>
    </section>
  );
}
