'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { CursorTooltip, cursorPoint } from './CursorTooltip';
import { svgAxisFont } from '../../../lib/cockpit/placeTooltip';
import { formatPounds } from '../../../lib/money';
import { pipelineInputEdit, pipelineView } from '../../../lib/forecast/pipelinePlan';

function money(minor) {
  if (minor == null || !Number.isFinite(Number(minor))) return '—';
  return formatPounds(Math.round(Number(minor)));
}

function PlanChart({ points, series }) {
  const [hidden, setHidden] = useState({});
  const [tip, setTip] = useState(null);
  const tipId = useId();
  const svgRef = useRef(null);
  const width = 720;
  const height = 200;
  const [axisFont, setAxisFont] = useState(12);
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const fit = () => {
      const box = svg.getBoundingClientRect();
      setAxisFont(svgAxisFont(12, width, box.width));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [width]);
  const visible = series.filter((item) => !hidden[item.id]);
  const values = visible.flatMap((item) => item.values.map((point) => point.value)).filter((value) => value != null && Number.isFinite(value));
  const max = Math.max(1, ...values.map((value) => Math.abs(value)));
  const padL = 72;
  const padR = 36;
  const padT = 16;
  const padB = 36;

  function show(point, event) {
    const lines = visible.map((item) => {
      const value = item.values.find((entry) => entry.id === point.id);
      return `${item.label}: ${value?.value == null ? '—' : formatPounds(Math.round(value.value * 100))}`;
    });
    setTip({ id: point.id, ...cursorPoint(event), text: `${point.label}\n${lines.join('\n')}` });
  }

  return (
    <figure className="chart-card" data-chart="forecast-plan">
      <div className="cl" role="group" aria-label="Forecast series">
        {series.map((item) => (
          <button key={item.id} type="button" className="chart-key" aria-pressed={!hidden[item.id]} onClick={() => setHidden((current) => ({ ...current, [item.id]: !current[item.id] }))}>
            <i style={{ background: item.kind === 'forecast' ? 'var(--orange)' : '#171717', opacity: item.kind === 'forecast' ? 0.6 : 1 }} />
            {item.label}
          </button>
        ))}
      </div>
      <div className="chart-plot" onMouseLeave={() => setTip(null)}>
        <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Active against scenario lines">
          <text x="4" y="12" className="chart-axis" style={{ fontSize: axisFont }} fontSize={axisFont}>£</text>
          {[0, 0.5, 1].map((step) => {
            const y = padT + (1 - step) * (height - padT - padB);
            const pounds = max * step;
            const abs = Math.abs(pounds);
            const compact = abs >= 1000 ? `${Math.round((abs / 1000) * 10) / 10}k` : String(Math.round(abs));
            return <g key={step}><line className="chart-grid" x1={padL} x2={width - padR} y1={y} y2={y} /><text className="chart-axis" style={{ fontSize: axisFont }} fontSize={axisFont} x={padL - 8} y={y + 4} textAnchor="end">{`${pounds < 0 ? '-' : ''}£${compact}`}</text></g>;
          })}
          {visible.map((item) => {
            const coords = points.map((point, index) => {
              const value = item.values.find((entry) => entry.id === point.id);
              if (value?.value == null || !Number.isFinite(value.value)) return null;
              const x = padL + (index * (width - padL - padR)) / Math.max(points.length - 1, 1);
              const y = padT + (1 - Math.abs(value.value) / max) * (height - padT - padB);
              return `${x},${y}`;
            }).filter(Boolean);
            if (coords.length < 2) return null;
            return <polyline key={item.id} data-kind={item.kind || 'history'} fill="none" stroke={item.kind === 'forecast' ? 'var(--orange)' : '#171717'} strokeWidth="1.6" opacity={item.kind === 'forecast' ? 0.55 : 1} points={coords.join(' ')} />;
          })}
          {points.map((point, index) => {
            const x = padL + (index * (width - padL - padR)) / Math.max(points.length - 1, 1);
            const slot = (width - padL - padR) / Math.max(points.length, 1);
            return (
              <g key={point.id}>
                <text className="chart-axis" style={{ fontSize: axisFont }} fontSize={axisFont} x={x} y={height - 14} textAnchor="middle">{point.label}</text>
                <rect className="chart-hit" x={x - slot / 2} y={padT} width={slot} height={height - padT - padB} fill="transparent" onMouseEnter={(event) => show(point, event)} onMouseMove={(event) => show(point, event)} />
              </g>
            );
          })}
        </svg>
        {tip ? <CursorTooltip id={tipId} text={tip.text} cursor={tip} className="chart-tip" /> : null}
      </div>
      <p className="caveat">Pounds by month. Active is the booked row. Orange lines are the Sheet’s percentage rows.</p>
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
        <p>{plan.tab}. Range {plan.range}. Actuals are the Active row. Scenarios use the Sheet’s own percentage labels.</p>
      </header>
      <div className="ov-tiles forecast-tiles">
        {view.tiles.map((tile) => <div key={tile.label} className="ov-tile" role="group"><span>{tile.label}</span><b className="num">{money(tile.minor)}</b></div>)}
      </div>
      <div className="panel glass">
        <PlanChart points={view.points} series={view.series} />
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
