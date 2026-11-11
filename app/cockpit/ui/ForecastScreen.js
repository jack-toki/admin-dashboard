'use client';

import { useEffect, useId, useState } from 'react';
import { CursorTooltip, cursorPoint } from './CursorTooltip';
import { formatPounds } from '../../../lib/money';
import { pipelineInputEdit, pipelineStack, pipelineView } from '../../../lib/forecast/pipelinePlan';

function money(minor) {
  if (minor == null || !Number.isFinite(Number(minor))) return '—';
  return formatPounds(Math.round(Number(minor)));
}

function compactPounds(minor) {
  const pounds = Math.abs(minor) / 100;
  const compact = pounds >= 1000 ? `${Math.round((pounds / 1000) * 10) / 10}k` : String(Math.round(pounds));
  return `${minor < 0 ? '-' : ''}£${compact}`;
}

function PlanChart({ stack }) {
  const [hidden, setHidden] = useState({});
  const [tip, setTip] = useState(null);
  const tipId = useId();
  const months = stack?.months || [];
  const keys = stack?.segments || [];
  const visible = (column) => column.segments.filter((segment) => !hidden[segment.id] && segment.minor > 0);
  const max = Math.max(1, ...months.map((column) => visible(column).reduce((sum, segment) => sum + segment.minor, 0)));

  function show(column, segment, event) {
    const clients = segment.clients.length
      ? segment.clients.map((client) => `${client.name} · ${formatPounds(client.minor)} · ${client.type || 'Type not stored'}`)
      : ['No client lines'];
    const text = [
      column.label,
      segment.label,
      formatPounds(segment.minor),
      ...clients,
      `Month actual ${formatPounds(column.actual)}`,
      `Month potential ${formatPounds(column.potential)}`,
    ].join('\n');
    setTip({ id: `${column.id}:${segment.id}`, ...cursorPoint(event), text });
  }

  return (
    <figure className="chart-card forecast-stack" data-chart="forecast-plan">
      <div className="cl" role="group" aria-label="Forecast segments">
        {keys.map((item) => (
          <button key={item.id} type="button" className="chart-key" aria-pressed={!hidden[item.id]} title={item.sheet || item.label} onClick={() => setHidden((current) => ({ ...current, [item.id]: !current[item.id] }))}>
            <i data-seg={item.id} />
            {item.legend || item.label}
          </button>
        ))}
      </div>
      <div className="fs-plot" onMouseLeave={() => setTip(null)}>
        <div className="fs-y" aria-hidden="true">
          <span>{compactPounds(max)}</span>
          <span>{compactPounds(max / 2)}</span>
          <span>£0</span>
        </div>
        <div className="fs-cols" role="img" aria-label="Stacked actual and potential by month">
          {months.map((column) => (
            <div key={column.id} className="fs-col">
              <div className="fs-track">
                {visible(column).reduce((state, segment) => {
                  const height = (segment.minor / max) * 100;
                  state.nodes.push(
                    <button
                      key={segment.id}
                      type="button"
                      className="fs-seg"
                      data-seg={segment.id}
                      aria-label={`${column.label}. ${segment.label}. ${formatPounds(segment.minor)}`}
                      style={{ bottom: `${state.bottom}%`, height: `${height}%` }}
                      onMouseEnter={(event) => show(column, segment, event)}
                      onMouseMove={(event) => show(column, segment, event)}
                    />,
                  );
                  state.bottom += height;
                  return state;
                }, { nodes: [], bottom: 0 }).nodes}
              </div>
              <span className="fs-x">{column.label}</span>
            </div>
          ))}
        </div>
        {tip ? <CursorTooltip id={tipId} text={tip.text} cursor={tip} className="chart-tip" /> : null}
      </div>
      <p className="caveat">Actual is the Retainers and Projects sections. Potential is the 75%, 50%, 25%, and 10% sections, in that order above the actual. A line has no probability of its own. Hosting, Backburner, and the Active formula are not drawn.</p>
    </figure>
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

  if (error) return <section className="panel glass"><h2>Forecast</h2><p className="sub">{error}</p></section>;
  if (!plan) return <section className="panel glass"><h2>Forecast</h2><p className="sub">Reading the private planning tab.</p></section>;
  const view = pipelineView(plan);
  return (
    <section className="forecast-plan" aria-label="Forecast">
      <header className="toki-section-head">
        <h2>Forecast</h2>
        <p>{plan.tab}. Range {plan.range}. Bars use the Retainers, Projects, and percentage sections. Probability is the section header, not a field on each line.</p>
      </header>
      <div className="ov-tiles forecast-tiles">
        {view.tiles.map((tile) => <div key={tile.label} className="ov-tile" role="group"><span>{tile.label}</span><b className="num">{money(tile.minor)}</b></div>)}
      </div>
      <div className="panel glass">
        <PlanChart stack={pipelineStack(plan)} />
      </div>
      {note ? <p className="caveat">{note}</p> : null}
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
