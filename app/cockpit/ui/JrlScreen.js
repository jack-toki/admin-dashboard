'use client';
import { useEffect, useMemo, useState } from 'react';
import { deriveLedger, ENTRY_FIELDS } from '../../../lib/jrl/finance';
import { monthWindow } from '../../../lib/jrl/months';
import { personalMonthlyPlan } from '../../../lib/jrl/targets';
import { performance, BENCHMARK_RATE } from '../../../vendor/jrl-finance/code/lib/finance.ts';
import { afford } from '../../../vendor/jrl-finance/code/lib/afford.ts';
import { monthsToTarget, projectPath } from '../../../vendor/jrl-finance/code/lib/targets.ts';
import { applyRange, forecastRate, forecastSeries, ledgerYears, stateAnnualRate, yearOverlay } from '../../../lib/jrl/chartRange';
import { ComparisonBars, InteractiveSeriesChart } from './charts';
import { PotCard } from './PotCard';
import { Tile } from './TokiScreen';
import { DetailDrawer, DetailFields } from './DetailDrawer';
import { blankPotRecord, latestPortfolioValue } from '../../../lib/jrl/pots';
import '../jrl.css';

const LINKS = [
  ['overview', 'Overview', 'Overview'],
  ['month', "This month's figures", 'Month'],
  ['targets', 'Targets', 'Targets'],
  ['spending', 'Spending', 'Spending'],
];

const EMPTY = {
  overview: 'Nothing here yet',
  targets: 'No targets yet',
  spending: 'Nothing logged this month',
};

export default function JrlScreen({ gate }) {
  const [section, setSection] = useState('overview');
  const [theme, setTheme] = useState('');
  const [entries, setEntries] = useState([]);
  const [targets, setTargets] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [form, setForm] = useState({ tax_in: '', savings_in: '', hl_in: '', savings_out: '', hl_value: '' });
  const [period, setPeriod] = useState('');
  const [saveNote, setSaveNote] = useState('');
  const [price, setPrice] = useState('');
  const [budget, setBudget] = useState('');
  const [floor, setFloor] = useState('500');
  const [savingsFirst, setSavingsFirst] = useState('0');
  const [potRecord, setPotRecord] = useState(blankPotRecord);
  const [potStored, setPotStored] = useState(false);
  const window = useMemo(() => monthWindow(new Date('2026-11-08T12:00:00Z')), []);

  useEffect(() => {
    let stored = '';
    try { stored = window.localStorage?.getItem('jrl-theme') || ''; } catch { stored = ''; }
    setTheme(stored);
    setPeriod(monthWindow(new Date()).defaultPeriod);
  }, []);

  useEffect(() => {
    const row = entries.find((item) => item.period === period);
    if (!row) return;
    setForm({
      tax_in: String(row.tax_in ?? ''),
      savings_in: String(row.savings_in ?? ''),
      hl_in: String(row.hl_in ?? ''),
      savings_out: String(row.savings_out ?? ''),
      hl_value: row.hl_value == null ? '' : String(row.hl_value),
    });
  }, [period, entries]);

  useEffect(() => {
    setEntries(Array.isArray(gate?.body?.entries) ? gate.body.entries : []);
    setTargets([]);
    setPurchases([]);
  }, [gate]);

  function onTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    window.localStorage.setItem('jrl-theme', next);
    window.dispatchEvent(new Event('jrl-theme'));
  }

  useEffect(() => {
    let cancel = false;
    fetch('/api/cockpit/jrl/pots').then(async (res) => {
      if (!res.ok || cancel) return;
      const body = await res.json();
      if (body.record) setPotRecord({ ...blankPotRecord(), ...body.record });
      setPotStored(body.stored === true);
    }).catch(() => {});
    return () => { cancel = true; };
  }, []);

  async function onPots(next) {
    const res = await fetch('/api/cockpit/jrl/pots', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.record) return false;
    setPotRecord({ ...blankPotRecord(), ...body.record });
    return true;
  }

  const ledger = useMemo(() => deriveLedger(entries), [entries]);
  const latest = ledger.at(-1) || null;
  const auth = gate?.body?.auth;
  const blocked = gate?.status === 403;

  async function onSave(event) {
    event.preventDefault();
    const res = await fetch('/api/cockpit/jrl/month', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ period, ...form }),
    });
    const body = await res.json();
    setSaveNote(body.saved
      ? 'Saved with the JRL session. The cockpit password was not used.'
      : body.error === 'supabase_user_required'
        ? 'Not saved. Sign in with the JRL account. This cockpit password does not write the ledger.'
        : 'Not saved. The ledger was left unchanged.');
  }

  if (blocked) {
    return <p>This sign-in cannot open personal finances.</p>;
  }

  async function clearConnection() {
    await fetch('/api/cockpit/jrl/session', { method: 'DELETE', headers: { 'x-cockpit-link': '1' } });
    window.location.assign('/cockpit#jrl');
  }

  return (
    <>
          <div className="tgt-modes" role="tablist" aria-label="JRL pages">
            {LINKS.map(([id, label]) => (
              <button key={id} type="button" className={section === id ? 'tgt-mode on' : 'tgt-mode'} onClick={() => setSection(id)}>{label}</button>
            ))}
            {auth?.supabaseUser ? (
              <details className="jrl-menu">
                <summary>Ledger settings</summary>
                <button type="button" onClick={clearConnection}>Clear stored connection</button>
              </details>
            ) : null}
          </div>
          {auth?.pinRequired ? (
            <form className="panel glass" onSubmit={async (event) => {
              event.preventDefault();
              const input = event.currentTarget.elements.pin;
              const res = await fetch('/api/cockpit/jrl/pin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: input.value }) });
              if (res.ok) window.location.assign('/cockpit#jrl');
              else setSaveNote('That PIN was not accepted.');
            }}>
              <h2>JRL PIN</h2>
              <p className="sub">This cockpit sign-in is enough. Enter the PIN you set. There is no separate JRL login.</p>
              <label className="entry-row"><span>PIN</span><span className="entry-input"><input name="pin" aria-label="JRL PIN" inputMode="numeric" autoComplete="off" /></span></label>
              {saveNote ? <p className="entry-err">{saveNote}</p> : null}
              <button className="btn" type="submit">Open JRL</button>
            </form>
          ) : null}
          {!auth?.pinRequired && section === 'overview' && !auth?.supabaseUser && (
            <section className="panel glass"><h2>Nothing here yet</h2><p className="sub">Pots and the ledger appear when the stored connection can read them. Missing months stay blank.</p></section>
          )}
          {!auth?.pinRequired && section === 'overview' && (
            <div className="bento">
              <PotCard record={potRecord} ledger={ledger} portfolioAvailable={Boolean(latestPortfolioValue(ledger))} onChange={onPots} editable={potStored} />
              {auth?.supabaseUser && <Overview ledger={ledger} targets={targets} />}
            </div>
          )}
          {auth?.supabaseUser && section === 'month' && (
            <MonthForm form={form} setForm={setForm} period={period} setPeriod={setPeriod} options={window.options} ledger={ledger} onSave={onSave} note={saveNote} />
          )}
          {auth?.supabaseUser && section === 'targets' && <Targets ledger={ledger} targets={targets} />}
          {auth?.supabaseUser && section === 'spending' && (
            <Spending purchases={purchases} targets={targets} savings={latest?.savings_total || 0} price={price} setPrice={setPrice} budget={budget} setBudget={setBudget} floor={floor} setFloor={setFloor} savingsFirst={savingsFirst} setSavingsFirst={setSavingsFirst} />
          )}
    </>
  );
}

function money(value) {
  if (value == null || Number.isNaN(value)) return '—';
  const sign = value < 0 ? '−' : '';
  return `${sign}£${Math.abs(Math.round(value)).toLocaleString('en-GB')}`;
}

function Overview({ ledger, targets }) {
  const [focus, setFocus] = useState(null);
  const [detail, setDetail] = useState(null);
  const [which, setWhich] = useState('latest');
  const [range, setRange] = useState({ preset: 'all', year: new Date().getFullYear(), from: '', to: '' });
  const [overlay, setOverlay] = useState(false);
  const [layers, setLayers] = useState({ none: true, m200: false, m500: false, custom: false });
  const [customMonthly, setCustomMonthly] = useState('100');
  const latest = ledger.at(-1);
  if (!latest) return <div className="panel glass"><h2>{EMPTY.overview}</h2><p className="sub">Five totals, targets, and the ledger appear when a Supabase user session can read them. Nothing here is filled with a made-up balance.</p></div>;
  const shown = which === 'last' ? ledger.at(-2) : latest;
  const previous = which === 'last' ? ledger.at(-3) : ledger.at(-2);
  const view = applyRange(ledger, range, new Date());
  const years = ledgerYears(ledger);
  const cards = shown ? [
    ['Net total', shown.net_total, true],
    ['Chase balance', shown.chase_total, false],
    ['Savings pot', shown.savings_total, false],
    ['Tax pot', shown.tax_total, false],
    ['HargLans ISA', shown.hl_contributed, false],
  ] : [
    ['Net total', null, true],
    ['Chase balance', null, false],
    ['Savings pot', null, false],
    ['Tax pot', null, false],
    ['HargLans ISA', null, false],
  ];
  const perf = performance(ledger.map((row) => ({
    period: row.period,
    hl_in: row.hl_in,
    hl_contributed: row.hl_contributed,
    hl_value: row.hl_chart_value ?? 0,
  })), BENCHMARK_RATE);
  perf.earningsThisMonth = shown?.hl_value == null ? null : shown?.earned;
  const chartValue = shown?.hl_chart_value;
  const icons = { 'Net total': 'net', 'Chase balance': 'chase', 'Savings pot': 'savings', 'Tax pot': 'tax', 'HargLans ISA': 'isa' };
  return (
    <div className="bento-contents">
      <div className="jrl-figures" role="group" aria-label="Summary month">
        <button type="button" aria-pressed={which === 'latest'} onClick={() => setWhich('latest')}>This month</button>
        <button type="button" aria-pressed={which === 'last'} onClick={() => setWhich('last')}>Last month</button>
        <span>{shown ? shown.period : 'No prior month'}</span>
      </div>
      <div className="bento-stats">
        {cards.map(([label, value, hero]) => {
          const before = !previous ? null : label === 'Net total' ? previous.net_total : label === 'Chase balance' ? previous.chase_total : label === 'Savings pot' ? previous.savings_total : label === 'Tax pot' ? previous.tax_total : previous.hl_contributed;
          return <Tile key={label} icon={icons[label]} highlight={hero} label={label} value={money(value)} delta={before == null ? null : money(value - before)} onOpen={() => setDetail({ title: label, fields: [{ label: 'Amount', value: money(value) }, { label: 'Previous month', value: before == null ? 'No prior month' : money(before) }] })} />;
        })}
      </div>
      <p className="caveat section-wide">HargLans ISA on the card is contributions, not the portfolio value. Net is Chase plus contributions. Gain is not added into that headline.</p>
      {targets.length > 0 && (
        <div className="tstrip">
          {targets.map((target) => {
            const current = target.track === 'savings' ? shown?.savings_total : target.track === 'tax' ? shown?.tax_total : shown?.net_total;
            const pct = target.target ? Math.round((current / target.target) * 100) : 0;
            return (
              <div key={target.id} className="tstrip-item glass">
                <div className="tstrip-text"><div className="tstrip-name">{target.name} · {target.scope}</div><div className="tstrip-amt num">{money(current)} <em>of {money(target.target)}</em></div></div>
                <div className="tstrip-pct num">{pct}<i>%</i></div>
              </div>
            );
          })}
        </div>
      )}
      <div className="grid2">
        <section className="panel glass">
          <h2>Allocation</h2>
          <p className="sub">Savings, tax, and contributions. Market gain stays out.</p>
          <Allocation row={shown || latest} onOpen={(item) => setDetail({ title: item.label, fields: [{ label: 'Amount', value: money(item.value) }, { label: 'Note', value: item.status }] })} />
        </section>
        <section className="panel glass">
          <h2>Growth</h2>
          <ChartRange range={range} years={years} overlay={overlay} onRange={setRange} onOverlay={setOverlay} />
          <Growth ledger={view.rows} overlay={overlay} selectedId={focus || shown?.period || latest.period} onSelect={(id) => { setFocus(id); const row = ledger.find((item) => item.period === id); setDetail({ title: id, fields: row ? ledgerFields(row) : [] }); }} />
          <p id="jrl-month-detail" aria-live="polite">Selected month {focus || latest.period}. Earnings stay unknown when that month has no fresh reading.</p>
        </section>
      </div>
      <section className="panel glass gap section-wide">
        <h2>HargLans ISA</h2>
        <div className="perf">
          <div className="mini"><div className="k">{shown?.hl_carried ? 'Value carried forward' : 'Portfolio value'}</div><div className="v">{money(chartValue)}</div></div>
          <div className="mini"><div className="k">{which === 'last' ? 'Earned that month' : 'Earned this month'}</div><div className="v">{money(perf.earningsThisMonth)}</div></div>
          <div className="mini"><div className="k">Gain so far</div><div className="v">{money(shown?.gain)}</div></div>
        </div>
        <Forecast ledger={view.rows} layers={layers} setLayers={setLayers} customMonthly={customMonthly} setCustomMonthly={setCustomMonthly} />
      </section>
      <section className="ledger glass gap bento-table">
        <div className="ledger-head"><h2>Ledger</h2></div>
        <div className="ledger-scroll">
          <table>
            <thead><tr><th><span className="sr">Select</span></th><th>Month</th><th>Savings</th><th>Tax</th><th>Chase</th><th>HargLans ISA</th><th>ISA value</th><th>Gain</th></tr></thead>
            <tbody>
              {[...ledger].reverse().map((row, index) => (
                <tr key={row.period} className={index === 0 ? 'latest click-row' : 'click-row'} onClick={() => setDetail({ title: row.period, fields: ledgerFields(row) })}>
                  <td><input type="checkbox" aria-label={`Select ${row.period}`} onClick={(event) => event.stopPropagation()} /></td>
                  <td>{row.period}</td>
                  <td>{money(row.savings_total)}</td>
                  <td>{money(row.tax_total)}</td>
                  <td>{money(row.chase_total)}</td>
                  <td>{money(row.hl_contributed)}</td>
                  <td>{row.hl_value == null ? (row.hl_carried ? `${money(row.hl_chart_value)}*` : '—') : money(row.hl_value)}</td>
                  <td>{row.gain == null ? '—' : money(row.gain)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <DetailDrawer title={detail?.title || ''} onClose={() => setDetail(null)}>
        {detail && <DetailFields fields={detail.fields} />}
      </DetailDrawer>
    </div>
  );
}

function ledgerFields(row) {
  return [
    { label: 'Month', value: row.period },
    { label: 'Savings', value: money(row.savings_total) },
    { label: 'Tax', value: money(row.tax_total) },
    { label: 'Chase', value: money(row.chase_total) },
    { label: 'HargLans contributions', value: money(row.hl_contributed) },
    { label: 'ISA value', value: row.hl_value == null ? '—' : money(row.hl_value) },
    { label: 'Gain', value: row.gain == null ? '—' : money(row.gain) },
  ];
}

function Allocation({ row, onOpen }) {
  return (
    <ComparisonBars
      name="allocation"
      onOpen={onOpen}
      format={money}
      caption="Savings, tax, and contributions. Portfolio value is not in this comparison."
      items={[
        { id: 'savings', label: 'Savings pot', value: row.savings_total, color: 'var(--chart-burgundy-100)', status: 'Pot from flows. Not market value.' },
        { id: 'tax', label: 'Tax pot', value: row.tax_total, color: 'var(--chart-red-100)', status: 'Pot from flows. Not market value.' },
        { id: 'hl', label: 'HargLans contributions', value: row.hl_contributed, color: 'var(--chart-sand-100)', status: 'Contributions, not portfolio value.' },
      ]}
    />
  );
}

function ChartRange({ range, years, overlay, onRange, onOverlay }) {
  const year = Number(range.year) || new Date().getFullYear();
  return (
    <div className="jrl-range">
      <div className="jrl-presets" role="group" aria-label="Chart dates">
        <button type="button" aria-pressed={range.preset === 'all'} onClick={() => onRange({ ...range, preset: 'all', from: '', to: '' })}>All time</button>
        <button type="button" aria-pressed={range.preset === 'year'} onClick={() => onRange({ ...range, preset: 'year', year })}>This year</button>
        <label>Year <select aria-label="Year" value={year} onChange={(event) => onRange({ ...range, preset: 'year', year: Number(event.target.value) })}>{(years.length ? years : [year]).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <button type="button" aria-pressed={range.preset === 'last'} onClick={() => onRange({ ...range, preset: 'last' })}>Last month</button>
        <button type="button" aria-pressed={overlay} onClick={() => onOverlay(!overlay)}>Year overlay</button>
      </div>
      <div className="jrl-presets">
        <label>From <input aria-label="From month" type="month" value={range.from || ''} onChange={(event) => onRange({ ...range, preset: 'custom', from: event.target.value })} /></label>
        <label>To <input aria-label="To month" type="month" value={range.to || ''} onChange={(event) => onRange({ ...range, preset: 'custom', to: event.target.value })} /></label>
      </div>
    </div>
  );
}

function Growth({ ledger, overlay, selectedId, onSelect }) {
  const overlaid = overlay ? yearOverlay(ledger, (row) => row.chase_total) : null;
  const points = overlaid ? overlaid.points : ledger.map((row) => ({ id: row.period, label: row.period.slice(0, 7) }));
  const series = overlaid ? overlaid.series.map((item, index) => ({ ...item, opacity: Math.max(0.35, 1 - index * 0.18) })) : [
    { id: 'chase', label: 'Chase', kind: 'history', values: ledger.map((row) => ({ id: row.period, value: row.chase_total, status: 'Derived from savings plus tax.' })) },
    { id: 'contrib', label: 'Contributions', kind: 'history', opacity: 0.55, values: ledger.map((row) => ({ id: row.period, value: row.hl_contributed, status: 'Contributions, not market value.' })) },
    { id: 'value', label: 'Portfolio value', kind: 'history', opacity: 0.35, values: ledger.map((row) => ({ id: row.period, value: row.hl_chart_value, status: row.hl_value == null ? 'Carried or not supplied. Gain unknown.' : 'Supplied reading.' })) },
  ];
  return (
    <InteractiveSeriesChart
      name="growth"
      points={points}
      selectedId={selectedId}
      onSelect={onSelect}
      format={money}
      xTitle={overlay ? 'Month' : 'Month'}
      yTitle="£"
      caption={overlay ? 'Each line is one year of Chase, January to December. The saved months stay in the ledger.' : 'Chase and contributions come from the saved flows. A carried portfolio value is not a new gain.'}
      series={series}
    />
  );
}

function Forecast({ ledger, layers, setLayers, customMonthly, setCustomMonthly }) {
  const history = ledger.filter((row) => row.hl_chart_value != null).map((row) => ({ id: row.period, label: row.period.slice(0, 7), value: row.hl_chart_value }));
  const current = history.at(-1)?.value ?? null;
  const contributed = ledger.at(-1)?.hl_contributed;
  const tracked = stateAnnualRate({ current, contributed, months: ledger.length });
  const chosen = forecastRate(tracked, ledger.length);
  const rate = chosen.rate;
  const chart = forecastSeries({
    history,
    current,
    annualRate: rate,
    monthsOfHistory: ledger.length,
    overlays: [
      { id: 'none', label: 'No new money', monthly: 0, on: layers.none },
      { id: 'm200', label: '+£200/month', monthly: 200, on: layers.m200 },
      { id: 'm500', label: '+£500/month', monthly: 500, on: layers.m500 },
      { id: 'custom', label: `+£${Number(customMonthly) || 0}/month`, monthly: Number(customMonthly) || 0, on: layers.custom },
    ],
  });
  function toggle(id) {
    setLayers((currentLayers) => ({ ...currentLayers, [id]: !currentLayers[id] }));
  }
  return (
    <div className="jrl-forecast">
      <div className="jrl-presets" role="group" aria-label="Forecast overlays">
        <button type="button" aria-pressed={layers.none} onClick={() => toggle('none')}>No new money</button>
        <button type="button" aria-pressed={layers.m200} onClick={() => toggle('m200')}>+£200/month</button>
        <button type="button" aria-pressed={layers.m500} onClick={() => toggle('m500')}>+£500/month</button>
        <button type="button" aria-pressed={layers.custom} onClick={() => toggle('custom')}>Custom</button>
        <label>Monthly <input aria-label="Custom monthly amount" inputMode="decimal" value={customMonthly} onChange={(event) => setCustomMonthly(event.target.value)} /></label>
      </div>
      {chosen.benchmark ? <p className="caveat">Under 12 months, the money-weighted figure swings. Forecasts use 7% until there is a year of readings.</p> : <p className="caveat">Forecasts use the tracked state rate ({((rate || 0) * 100).toFixed(1)}% a year). Red and sand lines are forecasts.</p>}
      <InteractiveSeriesChart
        name="forecast"
        points={chart.points}
        series={chart.series.map((item, index) => ({ ...item, color: item.kind === 'forecast' ? ['var(--chart-red-100)', 'var(--chart-red-60)', 'var(--chart-sand-100)', 'var(--chart-sand-50)'][index % 4] : 'var(--chart-burgundy-100)' }))}
        format={money}
        xTitle="Years"
        yTitle="£"
        caption="Tracked history stays. Forecasts start from the latest reading."
      />
    </div>
  );
}

function MonthForm({ form, setForm, period, setPeriod, options, ledger, onSave, note }) {
  const preview = deriveLedger([...ledger.filter((row) => row.period !== period), { period, ...form }]).find((row) => row.period === period);
  const known = ledger.some((row) => row.period === period);
  const fields = [
    ['tax_in', 'Tax saved', 'IN'],
    ['savings_in', 'Savings added', 'IN'],
    ['hl_in', 'HargLans ISA', 'IN'],
    ['savings_out', 'Withdrawn from savings', 'OUT'],
    ['hl_value', 'HargLans ISA value', 'Blank means not supplied'],
  ];
  return (
    <form className="panel glass" onSubmit={onSave} id="entry">
      <div className={known ? 'entry-status done' : 'entry-status todo'}><b>{period}</b> {known ? 'is in' : "isn't in yet"}</div>
      <div className="entry-head">
        <select className="month-select" aria-label="Month" value={period} onChange={(event) => setPeriod(event.target.value)}>
          {options.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
      <div className="entry-grid">
        <div>
          {fields.map(([key, label, hint]) => (
            <label key={key} className="entry-row">
              <span className="entry-label">{label}<em>{hint}</em></span>
              <span className="entry-input"><input aria-label={label} inputMode="decimal" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></span>
            </label>
          ))}
        </div>
        <div className="entry-preview">
          <div className="pre-row"><span>Savings</span><b className="num">{money(preview?.savings_total)}</b></div>
          <div className="pre-row"><span>Tax</span><b className="num">{money(preview?.tax_total)}</b></div>
          <div className="pre-row"><span>Contributions</span><b className="num">{money(preview?.hl_contributed)}</b></div>
          <div className="pre-row"><span>Chase</span><b className="num">{money(preview?.chase_total)}</b></div>
          <div className="pre-net"><span>Net</span><b className="num">{money(preview?.net_total)}</b></div>
          {preview?.overdrawn ? <p className="entry-warn">That withdrawal is more than the savings pot.</p> : null}
          <p className="caveat">Blank amounts count as zero. A blank ISA value is not zero and does not create a gain.</p>
        </div>
      </div>
      <div className="entry-actions">
        <button className="btn" type="submit">Save month</button>
        {note ? <span className="entry-err">{note}</span> : null}
      </div>
      <p className="foot-note">Fields stay in this order: {ENTRY_FIELDS.join(', ')}. Saving overwrites the same month. This form does not write the forecast workbook or Xero.</p>
    </form>
  );
}

function Targets({ ledger, targets }) {
  const latest = ledger.at(-1);
  const [mode, setMode] = useState('amount');
  const [monthly, setMonthly] = useState(200);
  const [goal, setGoal] = useState(2000);
  if (!targets.length && !latest) return <div className="panel glass"><h2>{EMPTY.targets}</h2></div>;
  const current = latest?.savings_total || 0;
  const months = monthsToTarget({ current, target: Number(goal), monthly: Number(monthly), annualRate: 0.045 });
  const path = projectPath({ current, target: Number(goal), monthly: Number(monthly), annualRate: 0.045, months: months || 1 });
  const end = path.at(-1);
  return (
    <section className="panel glass">
      <div className="tgt-modes">
        <button type="button" className={mode === 'amount' ? 'tgt-mode on' : 'tgt-mode'} onClick={() => setMode('amount')}>I’ll save this much</button>
        <button type="button" className={mode === 'date' ? 'tgt-mode on' : 'tgt-mode'} onClick={() => setMode('date')}>I want it by then</button>
      </div>
      <div className="tgt-grid">
        <div>
          <label className="entry-row"><span>Monthly</span><span className="entry-input"><input aria-label="Monthly amount" value={monthly} onChange={(event) => setMonthly(event.target.value)} /></span></label>
          <label className="entry-row"><span>Target</span><span className="entry-input"><input aria-label="Target amount" value={goal} onChange={(event) => setGoal(event.target.value)} /></span></label>
          <p className="caveat">Savings, Chase, and tax default to 4.5%. Net and HargLans default to 0, so they plan on contributions only. Scope is personal or business.</p>
        </div>
        <div className="tgt-answer">
          <div className="k">{months == null ? 'No end date at this rate' : `${months} months`}</div>
          <div className="tgt-big">{money(end?.value)}</div>
          <p className="caveat">The path uses the original monthly rate, (1 + annual) to the power of 1/12, minus 1.</p>
        </div>
      </div>
      <ul>
        {targets.map((target) => <li key={target.id}>{target.name} · {target.scope} · {target.track} · plan {money(target.monthly_plan)}</li>)}
      </ul>
      <p className="caveat">Personal commitments in the spending adviser: {money(personalMonthlyPlan(targets))}. Business targets stay out of that figure.</p>
    </section>
  );
}

function Spending({ purchases, targets, savings, price, setPrice, budget, setBudget, floor, setFloor, savingsFirst, setSavingsFirst }) {
  const advice = price === '' || budget === '' ? null : afford({
    price: Number(price),
    kind: 'want',
    monthlyBudget: Number(budget),
    spentThisMonth: purchases.reduce((sum, row) => sum + row.amount, 0),
    savingsPot: savings,
    emergencyFloor: Number(floor),
    targetCommitments: personalMonthlyPlan(targets),
    savingsFirst: Number(savingsFirst) || 0,
    savedThisMonth: 0,
  });
  return (
    <section className="panel glass">
      {!purchases.length && budget === '' ? <h2>{EMPTY.spending}</h2> : null}
      <div className="afford-fields">
        <label className="entry-row"><span>Price</span><span className="entry-input"><input aria-label="Price" value={price} onChange={(event) => setPrice(event.target.value)} /></span></label>
        <label className="entry-row"><span>Monthly budget</span><span className="entry-input"><input aria-label="Monthly budget" value={budget} onChange={(event) => setBudget(event.target.value)} /></span></label>
        <label className="entry-row"><span>Emergency floor</span><span className="entry-input"><input aria-label="Emergency floor" value={floor} onChange={(event) => setFloor(event.target.value)} /></span></label>
        <label className="entry-row"><span>Saving comes first</span><span className="entry-input"><input aria-label="Saving comes first" value={savingsFirst} onChange={(event) => setSavingsFirst(event.target.value)} /></span></label>
      </div>
      {!advice ? <p className="sub">Add a monthly budget and a price before this will advise.</p> : (
        <div className="afford-verdict">
          <div className={advice.verdict === 'no' || advice.verdict === 'wait' ? 'afford-head warn' : 'afford-head ok'}>{advice.headline}</div>
          <p className="afford-body">{advice.reasoning} Left alone for 10 years at 7%: {money(advice.opportunityCost)}.</p>
        </div>
      )}
      <div className="ledger-scroll">
        <table>
          <thead><tr><th>Day</th><th>Description</th><th>Amount</th><th>Need or want</th><th>Advice</th></tr></thead>
          <tbody>
            {purchases.map((row) => <tr key={row.id}><td>{row.day}</td><td>{row.description}</td><td>{money(row.amount)}</td><td>{row.kind}</td><td>{row.advice}</td></tr>)}
          </tbody>
        </table>
      </div>
    </section>
  );
}
