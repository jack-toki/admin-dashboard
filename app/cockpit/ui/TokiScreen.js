'use client';
import { useMemo, useState } from 'react';
import { formatPounds } from '../../../lib/money';
import { overview, drilldown, withScenario, automationBoard } from '../../../lib/finance/screen';
import { workingPlanMinor } from '../../../lib/planning/entries';
import { syntheticWorkflows, syntheticEvents, SYNTHETIC_BANNER } from '../../../lib/fixtures/synthetic';
import { TOKI_VIEWS } from '../../../lib/nav/sidebar';
import { InteractiveSeriesChart } from './charts';

function showMoney(minor) {
  if (minor == null || !Number.isFinite(minor)) return 'Missing information';
  return formatPounds(minor);
}

export function TokiScreen({ example, baseline, actuals, evidence, plan, planNote, onSave, onRemove, formError, forecastError, section = 'overview', onSection }) {
  const [month, setMonth] = useState('2026-01');
  const [mode, setMode] = useState('base');
  const [form, setForm] = useState({ id: '', kind: 'sale', amount: '', party: '', groupId: 'billing', timing: 'one_off', durationMonths: '3' });

  const view = useMemo(() => {
    if (!baseline) return null;
    const rows = mode === 'base' ? baseline.rows : withScenario(baseline.rows, mode);
    return overview({ rows }, actuals, month);
  }, [baseline, actuals, month, mode]);
  const chartSeries = useMemo(() => {
    if (!baseline) return null;
    const rows = mode === 'base' ? baseline.rows : withScenario(baseline.rows, mode);
    const points = baseline.months.map((item) => ({ id: item.key, label: item.header }));
    const billingAt = (id) => {
      const group = overview({ rows }, actuals, id).groups.find((item) => item.groupId === 'billing');
      return { ...group, shown: workingPlanMinor(group?.forecast.minor ?? null, plan, id, 'billing') };
    };
    return {
      points,
      series: [
        { id: 'plan', label: 'Plan', color: 'var(--ink)', values: points.map((point) => ({ id: point.id, value: billingAt(point.id)?.shown ?? null, status: baseline.synthetic ? 'Example forecast. The workbook is not read.' : 'Stored forecast plus your entries. The imported forecast is not changed.' })) },
        { id: 'actual', label: 'Accounting actual', color: 'var(--c1)', values: points.map((point) => {
          const group = billingAt(point.id);
          const coverage = actuals?.months?.[point.id]?.coverage;
          const partial = coverage === 'partial';
          return { id: point.id, value: group?.actual.known ? group.actual.minor : null, status: partial ? 'Partial accounting export. Not a complete profit and loss.' : group?.actual.known ? 'Historical accounting export. Not live Xero.' : 'Missing information' };
        }) },
      ],
    };
  }, [baseline, actuals, mode, plan]);
  const rows = useMemo(() => (baseline ? drilldown(mode === 'base' ? baseline : { rows: withScenario(baseline.rows, mode) }, month) : []), [baseline, month, mode]);
  const shownGroups = (view?.groups || []).map((group) => ({ ...group, shownForecast: workingPlanMinor(group.forecast.minor, plan, month, group.groupId) }));
  const billingShown = shownGroups.find((group) => group.groupId === 'billing')?.shownForecast ?? null;
  const costGroups = shownGroups.filter((group) => group.kind === 'cost' && group.shownForecast != null);
  const costShown = costGroups.length ? costGroups.reduce((sum, group) => sum + group.shownForecast, 0) : null;
  const monthPlans = (plan || []).filter((entry) => entry.month === month);

  if (!view) {
    return (
      <section>
        <div className="panel glass">
          <h2>{forecastError ? 'The stored forecast could not be read' : 'No forecast is stored yet'}</h2>
          <p style={muted}>{forecastError ? 'The workbook is not used as a fallback.' : 'The workbook is not read while the app is running. Stored cells are the forecast. Example data stays off until you ask for it.'}</p>
        </div>
      </section>
    );
  }

  const viewLabel = TOKI_VIEWS.find((item) => item.id === section)?.label || 'Overview';
  const monthLabel = baseline.months.find((item) => item.key === month)?.header;
  const coverage = actuals?.months?.[month]?.coverage;

  return (
    <section className="toki-view" aria-label={viewLabel}>
      <div className="toki-section-switch" role="navigation" aria-label="Toki sections">
        {TOKI_VIEWS.map((item) => (
          <button key={item.id} type="button" aria-current={section === item.id ? 'page' : undefined} onClick={() => onSection?.(item.id)}>{item.label}</button>
        ))}
      </div>
      {baseline.synthetic && <p className="caveat">{SYNTHETIC_BANNER} Example data. This is not the stored forecast.</p>}
      <header className="toki-section-head">
        <h2>{viewLabel}</h2>
        <p>{section === 'plan' ? 'Add or change a sale or cost for this month. The imported forecast is not changed.' : section === 'sources' ? 'Imported lines and where the figures come from. Nothing here is editable.' : 'Totals for this month. Your entries are included. Imported figures stay read only.'}</p>
      </header>
      <div className="toki-controls">
        <div className="toki-months" role="group" aria-label="Month">
          {baseline.months.map((item) => {
            const itemCoverage = actuals?.months?.[item.key]?.coverage;
            const suffix = itemCoverage === 'partial' ? ' · partial' : itemCoverage === 'missing' ? ' · missing' : '';
            return <button key={item.key} type="button" aria-pressed={month === item.key} onClick={() => setMonth(item.key)}>{item.header}{suffix}</button>;
          })}
        </div>
        {section === 'overview' && (
          <div className="tgt-modes">
            {[['base', 'Base'], ['best', 'Higher'], ['worst', 'Lower']].map(([id, label]) => (
              <button key={id} type="button" className={mode === id ? 'tgt-mode on' : 'tgt-mode'} onClick={() => setMode(id)}>{label}</button>
            ))}
          </div>
        )}
      </div>

      {section === 'overview' && (
        <>
          {chartSeries && (
            <div className="toki-block">
              <InteractiveSeriesChart name="billing" points={chartSeries.points} series={chartSeries.series} selectedId={month} onSelect={setMonth} format={formatPounds} caption={baseline.synthetic ? 'Example data. A missing actual stays unknown.' : 'Stored forecast. A missing actual stays unknown. January 2027 group totals are recomputed from inputs.'} />
              <p id="toki-month-detail" aria-live="polite">{monthLabel} selected. Xero is not connected.</p>
            </div>
          )}
          <Summary billing={billingShown} costs={costShown} />
          <GroupTable groups={shownGroups} />
          <div className="toki-notes">
            <p>{baseline.grossProfitMeaning}</p>
            {coverage === 'partial' && <p role="status">This month is a partial accounting export. It is not a complete profit and loss. People actuals are missing information.</p>}
            {coverage === 'missing' && <p role="status">Accounting actuals for this month are missing information, not zero.</p>}
            {(baseline.formulaFlags || []).map((flag) => (
              <p key={flag.month} role="status">January 2027 totals on screen are recomputed from stored input lines. The source total omits {formatPounds(flag.omittedMinor)}. The stored source cell is not replaced.</p>
            ))}
          </div>
        </>
      )}

      {section === 'plan' && (
        <>
          <Summary billing={billingShown} costs={costShown} />
          <form className="panel glass toki-panel" onSubmit={async (event) => { event.preventDefault(); const ok = await onSave({ ...form, month }); if (ok) setForm({ id: '', kind: 'sale', amount: '', party: '', groupId: 'billing', timing: 'one_off', durationMonths: '3' }); }}>
            <h3>{form.id ? 'Edit your entry' : 'Add a sale or cost'}</h3>
            <div className="toki-form">
              <select aria-label="Kind" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value, groupId: event.target.value === 'cost' ? 'administration' : 'billing' })}>
                <option value="sale">Sale</option>
                <option value="cost">Cost</option>
              </select>
              <input aria-label="Amount in pounds" placeholder="Amount" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
              <input aria-label="Client or vendor" placeholder="Client or vendor" value={form.party} onChange={(event) => setForm({ ...form, party: event.target.value })} />
              <select aria-label="Group" value={form.groupId} onChange={(event) => setForm({ ...form, groupId: event.target.value })}>
                <option value="billing">Billing</option>
                <option value="administration">Administration</option>
                <option value="people">People</option>
                <option value="premises">Premises</option>
                <option value="finance">Finance</option>
                <option value="selling">Selling</option>
              </select>
              <button type="submit">{form.id ? 'Save change' : 'Add to this month'}</button>
            </div>
            {formError && <p role="alert">{formError}</p>}
            {planNote && <p>{planNote} The imported forecast and Xero are not written.</p>}
            <ul className="toki-entries">
              {monthPlans.map((entry) => (
                <li key={entry.id}>
                  <span>{entry.kind} {showMoney(entry.amountMinor)} · {entry.party}</span>
                  <button type="button" onClick={() => setForm({ id: entry.id, kind: entry.kind, amount: String(entry.amountMinor / 100), party: entry.party, groupId: entry.groupId, timing: entry.timing || 'one_off', durationMonths: String(entry.durationMonths || 3) })}>Edit</button>
                  {onRemove && <button type="button" onClick={() => onRemove(entry.id)}>Remove</button>}
                </li>
              ))}
            </ul>
          </form>
        </>
      )}

      {section === 'sources' && (
        <>
          <div className="toki-table">
            <table>
              <caption>Imported lines, read only</caption>
              <thead><tr><th>Line</th><th>Amount</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}{row.suggested && row.kind !== 'revenue' ? ' · group not confirmed' : ''}</td>
                    <td>{showMoney(row.minor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="toki-notes">
            <p>{baseline.synthetic ? 'Example data. The workbook is not read.' : 'Stored forecast. The workbook is not read at runtime.'}</p>
            <p>{baseline.grossProfitMeaning}</p>
            {(baseline.formulaFlags || []).map((flag) => (
              <p key={flag.month} role="status">January 2027 totals on screen are recomputed from stored input lines. The source total omits {formatPounds(flag.omittedMinor)}. The stored source cell is not replaced.</p>
            ))}
            <p>Xero is not connected. {evidence?.invoices ? `Historical invoice copy: ${evidence.invoices.rows.length}, read only.` : 'No live accounting connection.'}</p>
            {(evidence?.planning?.rows || []).some((row) => row.planKind === 'salary_plan') && <p>Salary plan evidence is not added to costs.</p>}
            {evidence?.alternative?.cells?.length > 0 && <p>The V2 scenario is stored separately and is not added to this baseline.</p>}
            <p>A blank stays missing information. A stored zero stays £0.00. A partial month is not a finished result.</p>
          </div>
        </>
      )}
    </section>
  );
}

function Summary({ billing, costs }) {
  return (
    <div className="stats">
      <Tile label="Billing" value={showMoney(billing)} />
      <Tile label="Costs" value={showMoney(costs)} />
      <Tile label="Result" value={showMoney(billing == null || costs == null ? null : billing - costs)} />
    </div>
  );
}

export function AutomationsScreen({ example }) {
  if (!example) {
    return (
      <section>
        <div className="panel glass">
          <h2>No run log is connected</h2>
          <p style={muted}>Health, time, and value appear when events are stored. A workflow with no events is not treated as failed. Legacy posts without a run id are not turned into an exact hours figure.</p>
        </div>
      </section>
    );
  }
  const board = automationBoard(syntheticWorkflows(), syntheticEvents());
  return (
    <section>
      <p style={exampleBanner}>{SYNTHETIC_BANNER}</p>
          <div className="stats">
            <Tile label="Checkpoints" value={String(board.checkpoints)} />
            <Tile label="Unique runs" value={board.uniqueRuns == null ? 'Not known' : String(board.uniqueRuns)} />
            <Tile label="Estimated value" value={board.savings.withheld ? 'Not calculated' : formatPounds(board.savings.minor)} />
          </div>
      <div style={tableWrap}>
        <table style={table}>
          <thead><tr><th style={th}>Workflow</th><th style={th}>Status</th></tr></thead>
          <tbody>
            {board.rows.map((row) => (
              <tr key={row.zapId}>
                <td style={td}>{row.title}</td>
                <td style={td}>{row.health.state === 'no_events' ? 'No events yet' : row.health.state === 'last_event_succeeded' ? 'Last event succeeded' : row.health.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={muted}>{board.savings.label}</p>
    </section>
  );
}

function Tile({ label, value }) {
  return (
    <article className="card glass">
      <div className="k">{label}</div>
      <div className="v num">{value}</div>
    </article>
  );
}

function GroupTable({ groups }) {
  return (
    <div className="toki-table">
      <table>
        <thead><tr><th>Group</th><th>Plan</th><th>Accounting actual</th><th>Difference</th><th>Reading</th></tr></thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.groupId}>
              <td>{group.label}</td>
              <td>{showMoney(group.shownForecast ?? group.forecast.minor)}</td>
              <td>{group.actual.known ? showMoney(group.actual.minor) : group.groupId === 'people' ? 'Missing information. People actuals are not on record.' : group.actual.coverage === 'partial' ? 'Missing information. Partial export.' : 'Missing information'}</td>
              <td>{group.rawDifference == null ? 'Missing information' : formatPounds(group.rawDifference)}</td>
              <td>{group.judgement === 'unknown' ? 'Missing information' : group.judgement === 'incomplete' ? 'Incomplete' : group.direction}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VarianceChart({ groups }) {
  const rows = groups.filter((group) => group.forecast.minor != null || group.actual.known);
  const max = Math.max(...rows.flatMap((group) => [Math.abs(group.forecast.minor || 0), Math.abs(group.actual.minor || 0)]), 1);
  return (
    <div style={{ ...tableWrap, padding: 16 }} aria-label="Forecast and actual chart">
      {rows.map((group) => (
        <div key={group.groupId} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <span>{group.label}</span>
          <div>
            <Bar width={Math.abs(group.forecast.minor || 0) / max} color="#181b24" label="Plan" />
            <Bar width={group.actual.known ? Math.abs(group.actual.minor || 0) / max : 0} color="#ec5a29" label={group.actual.known ? 'Actual' : 'Actual not on record'} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Bar({ width, color, label }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 8, alignItems: 'center', marginBottom: 4 }}>
      <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
      <div style={{ height: 8, background: 'rgba(20,24,40,0.06)', borderRadius: 8 }}>
        <div style={{ width: `${Math.round(width * 100)}%`, height: '100%', background: color, borderRadius: 8 }} />
      </div>
    </div>
  );
}

const pills = { display: 'flex', gap: 4, flexWrap: 'wrap', padding: 4, borderRadius: 12, background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(20,24,40,0.07)', marginBottom: 14 };
const pill = (active) => ({ border: 'none', background: active ? '#fff' : 'transparent', color: active ? '#181b24' : '#6b7280', fontWeight: active ? 600 : 500, borderRadius: 9, padding: '6px 12px', cursor: 'pointer', boxShadow: active ? '0 1px 2px rgba(0,0,0,.08)' : 'none', font: 'inherit' });
const tiles = { display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 16 };
const tile = { background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(20,24,40,0.07)', borderRadius: 16, padding: '16px 18px' };
const tileLabel = { fontSize: 13, color: '#6b7280', marginBottom: 8 };
const tileValue = { fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em' };
const tableWrap = { overflowX: 'auto', background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(20,24,40,0.06)', borderRadius: 16, marginBottom: 12 };
const table = { width: '100%', borderCollapse: 'collapse' };
const th = { textAlign: 'left', padding: '12px 16px', color: '#6b7280', fontSize: 12.5, borderBottom: '1px solid rgba(20,24,40,0.06)' };
const td = { padding: '14px 16px', borderTop: '1px solid rgba(20,24,40,0.06)' };
const tdNum = { ...td, textAlign: 'right' };
const h2 = { fontSize: 18, fontWeight: 600 };
const muted = { color: '#6b7280', fontSize: 14 };
const exampleBanner = { background: '#fff', border: '1px solid rgba(236,90,41,0.45)', borderRadius: 12, padding: '10px 12px', fontWeight: 600 };
const empty = { background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(20,24,40,0.07)', borderRadius: 16, padding: '48px 28px', textAlign: 'center' };
const emptyTitle = { fontSize: 18, fontWeight: 600, marginBottom: 8 };
const formGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, alignItems: 'center' };
const input = { border: '1px solid rgba(20,24,40,0.07)', borderRadius: 9, padding: '8px 10px', font: 'inherit', background: '#fff' };
const button = { background: '#fff', border: '1px solid rgba(20,24,40,0.07)', borderRadius: 9, boxShadow: '0 1px 2px rgba(0,0,0,.08)', padding: '8px 12px', font: 'inherit', fontWeight: 600, cursor: 'pointer' };
