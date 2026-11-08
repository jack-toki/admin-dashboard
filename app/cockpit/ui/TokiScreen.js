'use client';
import { useMemo, useState } from 'react';
import { formatPounds } from '../../../lib/money';
import { overview, drilldown, withScenario, pipelineRow, reviewActivity, weeklyCommentary, automationBoard } from '../../../lib/finance/screen';
import { syntheticPipeline, syntheticContacts, syntheticFacts, syntheticWorkflows, syntheticEvents, SYNTHETIC_BANNER } from '../../../lib/fixtures/synthetic';
import { InteractiveSeriesChart } from './charts';

const SECTIONS = [
  ['overview', 'Overview'],
  ['variance', 'Actual and forecast'],
  ['plan', 'Add sale or cost'],
  ['scenario', 'What-if'],
  ['pipeline', 'Pipeline'],
  ['activity', 'Activity'],
  ['commentary', 'This week'],
];

export function TokiScreen({ example, baseline, actuals, evidence, plan, planNote, onSave, formError, forecastError }) {
  const [section, setSection] = useState('overview');
  const [month, setMonth] = useState('2026-01');
  const [mode, setMode] = useState('base');
  const [form, setForm] = useState({ kind: 'sale', amount: '', party: '', groupId: 'billing', month: '2026-01', timing: 'one_off', durationMonths: '3' });

  const view = useMemo(() => {
    if (!baseline) return null;
    const rows = mode === 'base' ? baseline.rows : withScenario(baseline.rows, mode);
    return overview({ rows }, actuals, month);
  }, [baseline, actuals, month, mode]);
  const chartSeries = useMemo(() => {
    if (!baseline) return null;
    const rows = mode === 'base' ? baseline.rows : withScenario(baseline.rows, mode);
    const points = baseline.months.map((item) => ({ id: item.key, label: item.header }));
    const billingAt = (id) => overview({ rows }, actuals, id).groups.find((group) => group.groupId === 'billing');
    return {
      points,
      series: [
        { id: 'plan', label: 'Plan', color: 'var(--ink)', values: points.map((point) => ({ id: point.id, value: billingAt(point.id)?.forecast.minor ?? null, status: baseline.synthetic ? 'Example forecast. The workbook is not read.' : 'Stored forecast. The workbook is not read.' })) },
        { id: 'actual', label: 'Accounting actual', color: 'var(--c1)', values: points.map((point) => {
          const group = billingAt(point.id);
          return { id: point.id, value: group?.actual.known ? group.actual.minor : null, status: group?.actual.known ? 'Example actual. Not from Xero.' : 'Not on record' };
        }) },
      ],
    };
  }, [baseline, actuals, mode]);
  const rows = useMemo(() => (baseline ? drilldown(mode === 'base' ? baseline : { rows: withScenario(baseline.rows, mode) }, month) : []), [baseline, month, mode]);
  const pipeline = example ? syntheticPipeline().map(pipelineRow) : (evidence?.planning?.rows || []).filter((row) => row.planKind === 'pipeline').map((row) => pipelineRow({
    leadId: row.id,
    label: row.party || 'Pipeline evidence',
    status: row.status || 'Unknown',
    amountMinor: row.amountMinor,
    probability: null,
  }));
  const activity = example ? reviewActivity(syntheticContacts()) : [];
  const notes = example ? weeklyCommentary(syntheticFacts()) : [];

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

  return (
    <section>
      {baseline.synthetic && <p className="caveat">{SYNTHETIC_BANNER} Example data. This is not the stored forecast.</p>}
      {!baseline.synthetic && <p className="caveat">Stored forecast. The workbook is not read at runtime.</p>}
      <div style={pills}>
        {SECTIONS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setSection(id)} style={pill(section === id)}>{label}</button>
        ))}
      </div>
      <div style={pills}>
        {baseline.months.map((item) => (
          <button key={item.key} type="button" onClick={() => setMonth(item.key)} style={pill(month === item.key)}>{item.header}</button>
        ))}
      </div>
      <div className="tgt-modes">
        {[['base', 'Base'], ['best', 'Higher'], ['worst', 'Lower']].map(([id, label]) => (
          <button key={id} type="button" className={mode === id ? 'tgt-mode on' : 'tgt-mode'} onClick={() => setMode(id)}>{label}</button>
        ))}
      </div>
      {chartSeries && (
        <>
          <InteractiveSeriesChart name="billing" points={chartSeries.points} series={chartSeries.series} selectedId={month} onSelect={setMonth} format={formatPounds} caption="Example data. A missing actual stays unknown. Higher and lower recompute the plan line only." />
          <p id="toki-month-detail" aria-live="polite">{baseline.months.find((item) => item.key === month)?.header} selected. Xero is not connected.</p>
        </>
      )}

      {section === 'overview' && (
        <>
          <div className="stats">
            <Tile label="Billing" value={formatPounds(view.revenueMinor)} />
            <Tile label="Costs" value={formatPounds(view.costMinor)} />
            <Tile label="Result" value={formatPounds(view.resultMinor)} />
          </div>
          <GroupTable groups={view.groups} />
          <p style={muted}>{baseline.grossProfitMeaning} {baseline.anomaly?.message}</p>
        </>
      )}

      {section === 'variance' && (
        <>
          <h2 style={h2}>{baseline.months.find((item) => item.key === month)?.header}</h2>
          <VarianceChart groups={view.groups} />
          <GroupTable groups={view.groups} />
          <div style={tableWrap}>
            <table style={table}>
              <thead><tr><th style={th}>Line</th><th style={th}>Amount</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label}>
                    <td style={td}>{row.label}{row.suggested ? ' · suggested group' : ''}</td>
                    <td style={tdNum}>{formatPounds(row.minor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={muted}>Gross profit in the stored forecast is the billing total, not profit after costs. People actuals are missing, not zero. A partial month is not a finished result. September to December are missing, not zero.</p>
          {evidence?.invoices && <p style={muted}>Historical invoice copy: {evidence.invoices.rows.length}. This is not live Xero.</p>}
          {(evidence?.planning?.rows || []).some((row) => row.planKind === 'salary_plan') && <p style={muted}>Salary plan lines stay separate and are not added to people costs. A blank period stays unassigned.</p>}
        </>
      )}

      {section === 'plan' && (
        <form onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
          <div style={formGrid}>
          <select aria-label="Kind" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })} style={input}>
            <option value="sale">Sale</option>
            <option value="cost">Cost</option>
          </select>
          <input aria-label="Amount in pounds" placeholder="Amount" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} style={input} />
          <input aria-label="Client or vendor" placeholder="Client or vendor" value={form.party} onChange={(event) => setForm({ ...form, party: event.target.value })} style={input} />
          <select aria-label="Group" value={form.groupId} onChange={(event) => setForm({ ...form, groupId: event.target.value })} style={input}>
            <option value="billing">Billing</option>
            <option value="administration">Administration</option>
            <option value="people">People</option>
            <option value="premises">Premises</option>
          </select>
          <select aria-label="Month" value={form.month} onChange={(event) => setForm({ ...form, month: event.target.value })} style={input}>
            {baseline.months.map((item) => <option key={item.key} value={item.key}>{item.header}</option>)}
          </select>
          <select aria-label="Timing" value={form.timing} onChange={(event) => setForm({ ...form, timing: event.target.value })} style={input}>
            <option value="one_off">Once</option>
            <option value="recurring">Repeats</option>
          </select>
          {form.timing === 'recurring' && <input aria-label="Number of months" placeholder="Months" value={form.durationMonths} onChange={(event) => setForm({ ...form, durationMonths: event.target.value })} style={input} />}
          <button style={button} type="submit">Save to the plan</button>
          </div>
          {formError && <p role="alert">{formError}</p>}
          {planNote && <p style={muted}>{planNote} The workbook and Xero are not written.</p>}
          <ul>
            {plan.map((entry) => <li key={entry.id}>{entry.kind} {formatPounds(entry.amountMinor)} · {entry.party} · {entry.month} · {entry.timing}</li>)}
          </ul>
        </form>
      )}

      {section === 'scenario' && (
        <>
          <div style={pills}>
            {[['base', 'Base'], ['best', 'Higher'], ['worst', 'Lower']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => setMode(id)} style={pill(mode === id)}>{label}</button>
            ))}
          </div>
          <div style={tiles}>
            <Tile label="Result in this what-if" value={formatPounds(overview({ rows: mode === 'base' ? baseline.rows : withScenario(baseline.rows, mode) }, actuals, month).resultMinor)} accent />
          </div>
          <p style={muted}>This recalculates from the cells on screen. The saved plan is not changed, and the workbook is not read.</p>
          {evidence?.alternative && <p style={muted}>The V2 scenario has {evidence.alternative.cells.length} stored cells. They are not added to this baseline.</p>}
        </>
      )}

      {section === 'pipeline' && (
        <div style={tableWrap}>
          <p style={muted}>Pipeline evidence is not a sale and is not an accounting actual.</p>
          <table style={table}>
            <thead><tr><th style={th}>Prospect</th><th style={th}>Stage</th><th style={th}>Amount</th><th style={th}>Probability</th></tr></thead>
            <tbody>
              {pipeline.map((deal) => (
                <tr key={deal.leadId}>
                  <td style={td}>{deal.label}</td>
                  <td style={td}>{deal.status}</td>
                  <td style={tdNum}>{formatPounds(deal.amountMinor)}</td>
                  <td style={td}>{deal.probabilityKnown ? deal.probability : 'Unknown'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {section === 'activity' && (
        <ul>
          {activity.map((item) => (
            <li key={item.leadId}>{item.label}: {item.classification === 'needs_review' ? 'Needs review' : item.classification}. {item.reason.replaceAll('_', ' ')}.</li>
          ))}
        </ul>
      )}

      {section === 'commentary' && (
        <ul>
          {notes.map((note) => <li key={note.evidence}>{note.text} Evidence: {note.evidence}.</li>)}
        </ul>
      )}
    </section>
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
    <div style={tableWrap}>
      <table style={table}>
        <thead><tr><th style={th}>Group</th><th style={th}>Plan</th><th style={th}>Accounting actual</th><th style={th}>Difference</th><th style={th}>Reading</th></tr></thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.groupId}>
              <td style={td}>{group.label}</td>
              <td style={tdNum}>{group.forecast.minor == null ? 'No forecast lines' : formatPounds(group.forecast.minor)}</td>
              <td style={tdNum}>{group.actual.known ? formatPounds(group.actual.minor) : 'Not on record'}</td>
              <td style={tdNum}>{group.rawDifference == null ? '—' : formatPounds(group.rawDifference)}</td>
              <td style={td}>{group.judgement === 'unknown' ? 'Unknown' : group.judgement === 'incomplete' ? 'Incomplete' : group.direction}</td>
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
