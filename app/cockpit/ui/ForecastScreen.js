'use client';

import { useEffect, useId, useState } from 'react';
import { cursorPoint } from './CursorTooltip';
import { formatPounds } from '../../../lib/money';
import { pipelineInputEdit, pipelineChart, focusPlan, standingDelta, currentMonthKey, PIPELINE_STAGES } from '../../../lib/forecast/pipelinePlan';

function axisText(label) {
  const named = String(label).match(/^([A-Za-z]{3}) (\d{4})$/);
  if (!named) return { full: label, short: label };
  return { full: `${named[1]} ${named[2].slice(2)}`, short: named[1] };
}

function money(minor) {
  if (minor == null || !Number.isFinite(Number(minor))) return '—';
  return formatPounds(Math.round(Number(minor)));
}

function compactPounds(minor) {
  const pounds = Math.abs(minor) / 100;
  const compact = pounds >= 1000 ? `${Math.round((pounds / 1000) * 10) / 10}k` : String(Math.round(pounds));
  return `${minor < 0 ? '-' : ''}£${compact}`;
}

function worthCount(minor, count) {
  return `${money(minor)} (${count})`;
}

function standingText(month) {
  const delta = standingDelta(month);
  if (delta == null) return 'No target this month';
  if (delta > 0) return `Over target by ${money(delta)}`;
  if (delta < 0) return `Under target by ${money(-delta)}`;
  return 'On target';
}

function shownMonth(months, keys, hover) {
  if (hover?.monthId && months.some((month) => month.id === hover.monthId)) {
    return months.find((month) => month.id === hover.monthId) || null;
  }
  const index = (keys || []).indexOf(currentMonthKey());
  return months[index] || months[months.length - 1] || null;
}

function PlanChart({ chart, pipelineOn, onToggle, hover, onHover, monthKeys }) {
  const tipId = useId();
  const months = chart?.months || [];
  const visibleSegments = (column) => column.segments.filter((segment) => segment.minor > 0 && (pipelineOn || segment.family === 'actual'));
  const max = Math.max(1, ...months.map((column) => {
    const stacked = visibleSegments(column).reduce((sum, segment) => sum + segment.minor, 0);
    return Math.max(stacked, column.target || 0);
  }));
  const month = shownMonth(months, monthKeys, hover);
  const points = months.map((column, index) => {
    const y = column.target == null ? null : 100 - (column.target / max) * 100;
    return y == null ? null : `${index + 0.5},${y}`;
  }).filter(Boolean).join(' ');

  return (
    <div className="forecast-board">
      <figure className="chart-card forecast-stack" data-chart="forecast-plan">
        <div className="cl" role="group" aria-label="Forecast layers">
          <span className="chart-key"><i data-seg="actual-retainer" />Retainers</span>
          <span className="chart-key"><i data-seg="actual-project" />Projects</span>
          <button type="button" className="chart-key" aria-pressed={pipelineOn} onClick={onToggle}><i data-seg="potential-75" />Pipeline</button>
        </div>
        <div className="fs-plot">
          <div className="fs-y" aria-hidden="true">
            <span>{compactPounds(max)}</span>
            <span>{compactPounds(max / 2)}</span>
            <span>£0</span>
          </div>
          <div className="fs-cols" role="img" aria-label="Retainers and projects, with the target as a dashed line">
            <svg className="fs-target" viewBox={`0 0 ${Math.max(months.length, 1)} 100`} preserveAspectRatio="none" aria-hidden="true">
              <polyline points={points} fill="none" stroke="currentColor" strokeDasharray="4 3" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </svg>
            {months.map((column) => (
              <div key={column.id} className={column.id === month?.id ? 'fs-col on' : 'fs-col'} onMouseEnter={() => onHover({ monthId: column.id, stageId: hover?.monthId === column.id ? hover.stageId : '' })} onClick={() => onHover({ monthId: column.id, stageId: '' })}>
                <div className="fs-track">
                  {visibleSegments(column).reduce((state, segment) => {
                    const height = (segment.minor / max) * 100;
                    const stage = column.stages.find((item) => item.id === segment.id);
                    const detail = segment.family === 'potential' && stage ? worthCount(stage.minor, stage.count) : money(segment.minor);
                    const base = state.nodes.length === 0;
                    state.nodes.push(
                      <button
                        key={segment.id}
                        type="button"
                        className={base ? 'fs-seg fs-base' : 'fs-seg'}
                        data-seg={segment.id}
                        aria-label={`${column.label}. ${segment.legend || segment.label}. ${detail}`}
                        style={{ bottom: `${state.bottom}%`, height: `${height}%` }}
                        onClick={() => onHover({ monthId: column.id, stageId: segment.family === 'potential' ? segment.id : '' })}
                        onMouseEnter={(event) => {
                          onHover({ monthId: column.id, stageId: segment.family === 'potential' ? segment.id : '', cursor: cursorPoint(event) });
                        }}
                        onMouseMove={(event) => onHover((current) => ({ ...current, monthId: column.id, cursor: cursorPoint(event) }))}
                      />,
                    );
                    state.bottom += height;
                    return state;
                  }, { nodes: [], bottom: 0 }).nodes}
                </div>
                <span className="fs-x"><span className="fs-x-full">{axisText(column.label).full}</span><span className="fs-x-short">{axisText(column.label).short}</span></span>
              </div>
            ))}
          </div>
        </div>
        <p className="caveat">Retainers and projects are the stack. The dashed line is the target, compared with those actual figures only. Pipeline sits above them when it is on.</p>
      </figure>
      <aside className="forecast-readout panel glass" aria-live="polite">
        {month ? (
          <>
            <h3>{month.label}</h3>
            <p><span>Projects</span><b>{money(month.projects)}</b></p>
            <p><span>Retainers</span><b>{money(month.retainers)}</b></p>
            <p><span>Target</span><b>{money(month.target)}</b></p>
            <p><span>Pipeline</span><b>{worthCount(month.pipeline, month.pipelineCount)}</b></p>
            {month.stages.map((stage) => (
              <p key={stage.id} className={hover?.stageId === stage.id ? 'on' : undefined}><span>{stage.label}</span><b>{worthCount(stage.minor, stage.count)}</b></p>
            ))}
            <p className="forecast-standing"><b>{standingText(month)}</b></p>
          </>
        ) : <p className="sub">Tap a month.</p>}
        <span id={tipId} className="sr">{month ? standingText(month) : ''}</span>
      </aside>
    </div>
  );
}

function DealEditor({ plan, onSave, note }) {
  const [draft, setDraft] = useState({ name: '', source: '', work: '', stage: '75' });
  const stages = plan?.stages || {};
  return (
    <div className="panel glass pipeline-editor">
      <h3>Pipeline</h3>
      <p className="sub">Add a deal or move one up a stage. The sheet keeps the monthly amounts. A stage with no empty line cannot take another deal.</p>
      <form className="pipeline-add" onSubmit={(event) => { event.preventDefault(); onSave(draft); setDraft({ name: '', source: '', work: '', stage: draft.stage }); }}>
        <label>Name<input aria-label="New deal name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label>Source<input aria-label="New deal source" value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })} /></label>
        <label>What we are doing<input aria-label="New deal work" value={draft.work} onChange={(event) => setDraft({ ...draft, work: event.target.value })} /></label>
        <label>Stage
          <select aria-label="New deal stage" value={draft.stage} onChange={(event) => setDraft({ ...draft, stage: event.target.value })}>
            {PIPELINE_STAGES.map((stage) => <option key={stage.id} value={stage.id}>{stage.id}%</option>)}
          </select>
        </label>
        <button type="submit" className="btn">Add deal</button>
      </form>
      {PIPELINE_STAGES.map((stage) => (
        <div key={stage.id}>
          <h4>{stage.id}%</h4>
          {(stages[stage.id]?.deals || []).map((deal) => (
            <DealRow key={deal.row} deal={deal} onSave={onSave} />
          ))}
          {!(stages[stage.id]?.deals || []).length ? <p className="sub">No deals in this stage.</p> : null}
        </div>
      ))}
      {note ? <p className="caveat">{note}</p> : null}
    </div>
  );
}

function DealRow({ deal, onSave }) {
  const [name, setName] = useState(deal.name);
  const [source, setSource] = useState(deal.source);
  const [work, setWork] = useState(deal.work);
  const [stage, setStage] = useState(deal.stage);
  return (
    <form className="pipeline-deal" onSubmit={(event) => { event.preventDefault(); onSave({ row: deal.row, name, source, work, stage }); }}>
      <label>Name<input aria-label={`${deal.name} name`} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Source<input aria-label={`${deal.name} source`} value={source} onChange={(event) => setSource(event.target.value)} /></label>
      <label>What we are doing<input aria-label={`${deal.name} work`} value={work} onChange={(event) => setWork(event.target.value)} /></label>
      <label>Stage
        <select aria-label={`${deal.name} stage`} value={stage} onChange={(event) => setStage(event.target.value)}>
          {PIPELINE_STAGES.map((item) => <option key={item.id} value={item.id}>{item.id}%</option>)}
        </select>
      </label>
      <button type="submit" className="btn">Save</button>
    </form>
  );
}

function poundsInput(minor) {
  if (minor == null) return '';
  const pounds = minor / 100;
  return Number.isInteger(pounds) ? String(pounds) : String(Math.round(pounds * 100) / 100);
}

export function ForecastScreen() {
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [drafts, setDrafts] = useState({});
  const [pipelineOn, setPipelineOn] = useState(true);
  const [hover, setHover] = useState(null);
  const [past, setPast] = useState('12');
  const [future, setFuture] = useState('12');

  useEffect(() => {
    let cancel = false;
    fetch('/api/cockpit/forecast-plan').then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (cancel) return;
      if (!res.ok || !body.plan) {
        setPlan(null);
        setError(body.configured === false ? 'The private forecast Sheet is not connected from this server.' : 'The planning tab could not be read.');
        return;
      }
      setError('');
      setPlan(body.plan);
    }).catch(() => { if (!cancel) setError('The planning tab could not be read.'); });
    return () => { cancel = true; };
  }, []);

  async function save(cell, text) {
    const edit = pipelineInputEdit(cell.minor, text);
    if (edit.action === 'skip') return;
    const res = await fetch('/api/cockpit/forecast-plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(edit.action === 'clear'
        ? { a1: cell.a1, clear: true, stored: poundsInput(cell.minor) }
        : { a1: cell.a1, minor: edit.minor, stored: poundsInput(cell.minor) }),
    });
    const body = await res.json().catch(() => ({}));
    setNote(body.status === 'written' ? `${cell.a1} saved.` : body.status === 'conflict' ? `${cell.a1} changed in the Sheet. Not written.` : body.reason === 'formula' ? `${cell.a1} is a formula. Left unchanged.` : 'Not written.');
    if (body.status === 'written') {
      const next = await fetch('/api/cockpit/forecast-plan').then((item) => item.json()).catch(() => null);
      if (next?.plan) setPlan(next.plan);
    }
  }

  async function saveDeal(input) {
    const res = await fetch('/api/cockpit/forecast-plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'save-deal', ...input }),
    });
    const body = await res.json().catch(() => ({}));
    setNote(body.ok ? 'Deal saved.' : body.reason === 'stage_full' ? 'That stage has no empty line on the sheet.' : body.reason === 'name' ? 'A name is required.' : 'The deal was not saved.');
    if (body.ok) {
      const next = await fetch('/api/cockpit/forecast-plan').then((item) => item.json()).catch(() => null);
      if (next?.plan) setPlan(next.plan);
    }
  }

  if (error) return <section className="panel glass"><h2>Forecast</h2><p className="sub">{error}</p></section>;
  if (!plan) return <section className="panel glass"><h2>Forecast</h2><p className="sub">Reading the private planning tab.</p></section>;
  const focused = focusPlan(plan, { past, future });
  const chart = pipelineChart(focused);
  return (
    <section className="forecast-plan" aria-label="Forecast">
      <header className="toki-section-head">
        <h2>Forecast</h2>
        <p>{plan.tab}. Retainers and projects are the lines in those sections. Hosting is not in the stack. The dashed line is that month’s target.</p>
      </header>
      <div className="forecast-filters">
        <label>Past
          <select aria-label="Past" value={past} onChange={(event) => setPast(event.target.value)}>
            <option value="none">None</option>
            <option value="3">Last 3 months</option>
            <option value="6">Last 6 months</option>
            <option value="12">Last 12 months</option>
            <option value="year">Last year</option>
          </select>
        </label>
        <label>Future
          <select aria-label="Future" value={future} onChange={(event) => setFuture(event.target.value)}>
            <option value="none">None</option>
            <option value="3">Next 3 months</option>
            <option value="6">Next 6 months</option>
            <option value="12">Next 12 months</option>
          </select>
        </label>
      </div>
      <p className="sub">Totals for the months on the chart.</p>
      <div className="ov-tiles forecast-tiles">
        {chart.tiles.map((tile) => <div key={tile.label} className="ov-tile" role="group"><span>{tile.label}</span><b className="num">{money(tile.minor)}</b></div>)}
      </div>
      <div className="panel glass">
        {chart.months.length ? <PlanChart chart={chart} monthKeys={focused.monthKeys} pipelineOn={pipelineOn} onToggle={() => setPipelineOn((on) => !on)} hover={hover} onHover={setHover} /> : <p className="sub">None of the months fall in this range.</p>}
      </div>
      <DealEditor plan={plan} onSave={saveDeal} note={note} />
      <div className="ledger glass ledger-scroll">
        <table className="forecast-table">
          <caption className="sub">{plan.tab}</caption>
          <thead>
            <tr>
              <th>Line</th>
              <th>Source</th>
              <th>Total</th>
              {plan.months.map((month) => <th key={month}>{month}</th>)}
            </tr>
          </thead>
          <tbody>
            {plan.rows.map((row) => (
              <tr key={`${row.row}-${row.label}`} className={row.kind === 'section' || row.kind === 'summary' ? 'latest' : undefined}>
                <td>{row.label}</td>
                <td>{row.source}</td>
                <td className="num">{row.total.formula || row.total.minor == null ? money(row.total.minor) : money(row.total.minor)}</td>
                {row.cells.map((cell) => (
                  <td key={cell.a1}>
                    {cell.input ? (
                      <input
                        aria-label={`${row.label} ${cell.header}`}
                        defaultValue={drafts[cell.a1] ?? poundsInput(cell.minor)}
                        onChange={(event) => setDrafts((current) => ({ ...current, [cell.a1]: event.target.value }))}
                        onBlur={(event) => save(cell, event.target.value)}
                      />
                    ) : <span className="num">{cell.minor == null ? '—' : money(cell.minor)}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
