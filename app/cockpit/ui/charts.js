'use client';
import { useId, useState } from 'react';

export function InteractiveSeriesChart({
  name,
  points,
  series,
  selectedId,
  onSelect,
  format,
  caption,
}) {
  const [hidden, setHidden] = useState({});
  const [tip, setTip] = useState(null);
  const tipId = useId();
  const visible = series.filter((item) => !hidden[item.id]);
  const values = visible.flatMap((item) => item.values.map((point) => point.value)).filter((value) => value != null);
  const max = Math.max(1, ...values.map((value) => Math.abs(value)));
  const width = 640;
  const height = 220;
  const pad = 36;

  function show(point, item, event) {
    const value = item.values.find((entry) => entry.id === point.id);
    setTip({
      id: point.id,
      seriesId: item.id,
      text: `${point.label} · ${item.label} · ${value?.value == null ? 'Missing information' : format(value.value)} · ${value?.status || 'Unknown'}`,
    });
    if (event?.currentTarget && typeof event.currentTarget.focus === 'function' && event.type === 'pointerdown') {
      event.currentTarget.focus();
    }
  }

  function choose(point) {
    onSelect?.(point.id);
  }

  return (
    <figure className="panel glass chart-card" data-chart={name}>
      <div className="cl" role="group" aria-label={`${name} series`}>
        {series.map((item) => (
          <button
            key={item.id}
            type="button"
            className="chart-key"
            aria-pressed={!hidden[item.id]}
            onClick={() => setHidden((current) => ({ ...current, [item.id]: !current[item.id] }))}
          >
            <i style={{ background: item.color }} />
            {item.label}
          </button>
        ))}
      </div>
      <div className="chart-plot">
        <svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label={name}>
          {visible.map((item) => {
            const coords = points.map((point, index) => {
              const value = item.values.find((entry) => entry.id === point.id);
              if (value?.value == null) return null;
              const x = pad + (index * (width - pad * 2)) / Math.max(points.length - 1, 1);
              const y = height - pad - (Math.abs(value.value) / max) * (height - pad * 2);
              return { x, y, point, value };
            }).filter(Boolean);
            const line = coords.map((spot) => `${spot.x},${spot.y}`).join(' ');
            return (
              <g key={item.id}>
                {coords.length > 1 && <polyline fill="none" stroke={item.color} strokeWidth="2.5" points={line} />}
                {coords.map((spot) => (
                  <circle key={spot.point.id} cx={spot.x} cy={spot.y} r="4" fill={item.color} />
                ))}
              </g>
            );
          })}
          {points.map((point, index) => {
            const x = pad + (index * (width - pad * 2)) / Math.max(points.length - 1, 1);
            return visible.map((item, seriesIndex) => {
              const value = item.values.find((entry) => entry.id === point.id);
              const y = value?.value == null
                ? height - pad
                : height - pad - (Math.abs(value.value) / max) * (height - pad * 2);
              return (
                <circle
                  key={`${item.id}-${point.id}`}
                  className="chart-hit"
                  data-chart-point={point.id}
                  data-series={item.id}
                  cx={x + (visible.length > 1 ? (seriesIndex - (visible.length - 1) / 2) * 0 : 0)}
                  cy={value?.value == null ? height - 18 : y}
                  r="11"
                  fill="transparent"
                  tabIndex="0"
                  role="button"
                  aria-label={`${point.label}, ${item.label}, ${value?.value == null ? 'Missing information' : format(value.value)}, ${value?.status || 'unknown'}`}
                  aria-describedby={tip?.id === point.id && tip?.seriesId === item.id ? tipId : undefined}
                  onMouseEnter={(event) => show(point, item, event)}
                  onFocus={(event) => show(point, item, event)}
                  onPointerDown={(event) => show(point, item, event)}
                  onClick={() => choose(point)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      choose(point);
                    }
                  }}
                  onBlur={() => setTip(null)}
                />
              );
            });
          })}
        </svg>
        {tip && <div id={tipId} role="status" className="chart-tip">{tip.text}</div>}
      </div>
      {caption && <p className="caveat">{caption}</p>}
      <div className="ledger-scroll">
        <table className="chart-fallback">
          <caption className="sub">{name} values</caption>
          <thead>
            <tr>
              <th>Month</th>
              {series.map((item) => <th key={item.id}>{item.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.id} className={point.id === selectedId ? 'latest' : undefined}>
                <td>{point.label}</td>
                {series.map((item) => {
                  const value = item.values.find((entry) => entry.id === point.id);
                  return <td key={item.id}>{value?.value == null ? 'Missing information' : format(value.value)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

export function CompactColumns({ name, points, series, selectedId, onSelect, format }) {
  const [hidden, setHidden] = useState({});
  const [tip, setTip] = useState(null);
  const tipId = useId();
  const visible = series.filter((item) => !hidden[item.id]);
  const nums = visible.flatMap((item) => item.values.map((value) => value.value)).filter((value) => value != null && Number.isFinite(value));
  const max = Math.max(1, ...nums.map((value) => Math.abs(value)));
  const width = 320;
  const height = 132;
  const left = 36;
  const right = 6;
  const top = 8;
  const bottom = 18;
  const innerW = width - left - right;
  const innerH = height - top - bottom;
  const slot = innerW / Math.max(points.length, 1);

  function money(value) {
    if (value == null || !Number.isFinite(value)) return 'Missing information';
    return format(value);
  }

  function axis(minor) {
    const pounds = minor / 100;
    const rounded = Math.abs(pounds) >= 100 ? Math.round(pounds) : Math.round(pounds * 10) / 10;
    return `${pounds < 0 ? '-' : ''}£${rounded.toLocaleString('en-GB')}`;
  }

  return (
    <figure className="year-chart" data-chart={name}>
      <figcaption>
        <strong>{name}</strong>
        <span className="year-legend" role="group" aria-label={`${name} series`}>
          {series.map((item) => (
            <button key={item.id} type="button" className="chart-key" aria-pressed={!hidden[item.id]} onClick={() => setHidden((current) => ({ ...current, [item.id]: !current[item.id] }))}>
              <i style={{ background: item.color }} />
              {item.label}
            </button>
          ))}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label={name}>
        {[0, 0.5, 1].map((step) => {
          const y = top + innerH - step * innerH;
          return <g key={step}><line x1={left} x2={width - right} y1={y} y2={y} className="chart-grid" /><text x={left - 4} y={y + 3} textAnchor="end">{axis(max * step)}</text></g>;
        })}
        {points.map((point, index) => {
          const x = left + index * slot;
          const selected = point.id === selectedId;
          return (
            <g key={point.id}>
              {selected && <rect className="chart-select" x={x + 2} y={top} width={Math.max(slot - 4, 1)} height={innerH} rx="4" />}
              {visible.map((item, seriesIndex) => {
                const value = item.values.find((entry) => entry.id === point.id);
                if (value?.value == null || !Number.isFinite(value.value)) return null;
                const barW = Math.min(8, Math.max(3, (slot - 8) / visible.length));
                const h = value.value === 0 ? 2 : Math.max(2, (Math.abs(value.value) / max) * (innerH - 2));
                const bx = x + (slot - visible.length * barW) / 2 + seriesIndex * barW;
                return <rect key={item.id} data-bar={item.id} data-state={value.value === 0 ? 'zero' : 'value'} x={bx} y={top + innerH - h} width={barW - 1} height={h} rx="2" fill={selected && item.id === 'plan' ? 'var(--orange)' : item.color} opacity={selected || item.id !== 'plan' ? 0.95 : 0.45} />;
              })}
              <text x={x + slot / 2} y={height - 4} textAnchor="middle">{point.label}</text>
              <rect
                className="chart-hit"
                data-chart-point={point.id}
                x={x}
                y={top}
                width={slot}
                height={innerH}
                fill="transparent"
                tabIndex="0"
                role="button"
                aria-label={`${point.label}. ${visible.map((item) => `${item.label} ${money(item.values.find((entry) => entry.id === point.id)?.value)}`).join('. ')}.`}
                aria-describedby={tip?.id === point.id ? tipId : undefined}
                onMouseEnter={() => setTip({ id: point.id, text: `${point.label} · ${visible.map((item) => `${item.label} ${money(item.values.find((entry) => entry.id === point.id)?.value)}`).join(' · ')}` })}
                onFocus={() => setTip({ id: point.id, text: `${point.label} · ${visible.map((item) => `${item.label} ${money(item.values.find((entry) => entry.id === point.id)?.value)}`).join(' · ')}` })}
                onPointerDown={() => setTip({ id: point.id, text: `${point.label} · ${visible.map((item) => `${item.label} ${money(item.values.find((entry) => entry.id === point.id)?.value)}`).join(' · ')}` })}
                onClick={() => onSelect?.(point.id)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect?.(point.id); } }}
                onBlur={() => setTip(null)}
              />
            </g>
          );
        })}
      </svg>
      {tip && <div id={tipId} role="status" className="chart-tip">{tip.text}</div>}
    </figure>
  );
}

function moneyText(value, format) {
  if (value == null || !Number.isFinite(value)) return 'Missing information';
  return format(value);
}

function axisText(minor) {
  const pounds = minor / 100;
  const abs = Math.abs(pounds);
  const sign = pounds < 0 ? '−' : '';
  if (abs >= 1000) {
    const thousands = abs / 1000;
    const text = Number.isInteger(thousands) ? String(thousands) : String(Math.round(thousands * 10) / 10);
    return `${sign}£${text}k`;
  }
  return `${sign}£${Math.round(abs)}`;
}

function niceMax(minor) {
  const pounds = Math.max(minor / 100, 1);
  const step = pounds >= 100000 ? 20000 : pounds >= 20000 ? 10000 : pounds >= 5000 ? 1000 : 500;
  return Math.ceil(pounds / step) * step * 100;
}

function ChartLegend({ name, series, hidden, setHidden }) {
  return (
    <span className="year-legend" role="group" aria-label={`${name} series`}>
      {series.map((item) => (
        <button key={item.id} type="button" className="chart-key" aria-pressed={!hidden[item.id]} onClick={() => setHidden((current) => ({ ...current, [item.id]: !current[item.id] }))}>
          <i style={{ background: item.color }} />
          {item.label}
        </button>
      ))}
    </span>
  );
}

function typeLabel(type) {
  if (type === 'retainer') return 'Retainer';
  if (type === 'project') return 'Project';
  return 'Not set';
}

function linePhrase(line, format) {
  const kind = line.aggregate ? `${typeLabel(line.type)} aggregate` : typeLabel(line.type);
  return `${kind} · ${line.name} · ${moneyText(line.minor, format)}`;
}

export function YearColumns({ name, months, selectedId, onOpen, format }) {
  const [hidden, setHidden] = useState({});
  const [focusId, setFocusId] = useState('');
  const legend = [
    ...(months[0]?.segments || []).map((item) => ({ id: item.id, label: item.label, color: item.color })),
    { id: 'actual', label: 'Actual', color: 'var(--series-actual)' },
  ];
  const visible = new Set(legend.map((item) => item.id).filter((id) => !hidden[id]));
  const nums = months.flatMap((month) => [
    ...month.segments.filter((item) => visible.has(item.id)).map((item) => item.value),
    visible.has('actual') ? month.actual : null,
  ]).filter((value) => value != null && Number.isFinite(value));
  const max = niceMax(Math.max(1, ...nums.map((value) => Math.abs(value))));
  const active = months.find((month) => month.id === (focusId || selectedId)) || months[0];
  const shownLines = (active?.lines || []).filter((line) => visible.has(line.type) || (line.type === 'unallocated' && visible.has('unallocated')));

  return (
    <figure className="finance-plot" data-chart={name}>
      <figcaption>
        <strong>{name}</strong>
        <ChartLegend name={name} series={legend} hidden={hidden} setHidden={setHidden} />
      </figcaption>
      <div className="col-chart">
        <div className="col-axis" aria-hidden="true">
          <span>{axisText(max)}</span>
          <span>{axisText(max / 2)}</span>
          <span>{axisText(0)}</span>
        </div>
        <div className="col-plot" role="group" aria-label={name}>
          <div className="col-grid" aria-hidden="true" />
          {months.map((month) => (
            <button
              key={month.id}
              type="button"
              className="col-slot"
              data-chart-point={month.id}
              aria-pressed={month.id === selectedId}
              aria-label={`${month.label}. Income ${moneyText(month.total, format)}. ${month.lines.map((line) => linePhrase(line, format)).join('. ')}. Opens income and costs.`}
              onClick={() => onOpen?.(month.id)}
              onFocus={() => setFocusId(month.id)}
              onBlur={() => setFocusId('')}
              onMouseEnter={() => setFocusId(month.id)}
              onMouseLeave={(event) => { if (event.currentTarget !== document.activeElement) setFocusId(''); }}
              onPointerDown={() => setFocusId(month.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onOpen?.(month.id);
                }
              }}
            >
              <span className="col-bars">
                <span className="col-stack">
                  {month.segments.filter((item) => visible.has(item.id) && item.value != null && Number.isFinite(item.value)).map((item) => (
                    <i key={item.id} data-bar={item.id} data-state={item.value === 0 ? 'zero' : 'value'} style={{ height: item.value === 0 ? undefined : `${(Math.abs(item.value) / max) * 100}%`, background: item.color }} />
                  ))}
                </span>
                {visible.has('actual') && month.actual != null && Number.isFinite(month.actual) ? (
                  <i data-bar="actual" data-state={month.actual === 0 ? 'zero' : 'value'} style={{ height: month.actual === 0 ? undefined : `${(Math.abs(month.actual) / max) * 100}%`, background: 'var(--series-actual)' }} />
                ) : null}
              </span>
              <span className="col-label">{month.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="chart-readout" role="status">
        <p>{active ? `${active.label} · Income ${moneyText(active.total, format)} · Actual ${moneyText(active.actual, format)}` : 'Select a month'}</p>
        {shownLines.length > 0 && (
          <ul>
            {shownLines.map((line) => (
              <li key={`${line.type}-${line.name}`} data-income-line={line.name}>{linePhrase(line, format)}</li>
            ))}
          </ul>
        )}
      </div>
    </figure>
  );
}

export function HorizontalBars({ name, points, series, format }) {
  const [hidden, setHidden] = useState({});
  const [focusId, setFocusId] = useState('');
  const visible = series.filter((item) => !hidden[item.id]);
  const nums = visible.flatMap((item) => item.values.map((value) => value.value)).filter((value) => value != null && Number.isFinite(value));
  const single = visible.length <= 1;
  const active = points.find((point) => point.id === focusId) || points[0];
  const segmentNums = points.flatMap((point) => (point.segments || []).map((item) => item.value));
  const max = Math.max(1, ...nums.map((value) => Math.abs(value)), ...segmentNums.filter((value) => value != null && Number.isFinite(value)).map((value) => Math.abs(value)));

  return (
    <figure className="finance-plot" data-chart={name}>
      <figcaption>
        <strong>{name}</strong>
        <ChartLegend name={name} series={series} hidden={hidden} setHidden={setHidden} />
      </figcaption>
      <div className="hbar-list" role="group" aria-label={name}>
        {points.map((point) => (
          <div className="hbar-group" key={point.id}>
            <span className="hbar-name">{point.label}</span>
            <div className="hbar-series">
              {visible.map((item) => {
                const value = item.values.find((entry) => entry.id === point.id)?.value;
                const known = value != null && Number.isFinite(value);
                const width = !known || value === 0 ? undefined : `${Math.max(2, (Math.abs(value) / max) * 100)}%`;
                const stacked = item.id === 'plan' && point.segments;
                const lineText = point.lines ? point.lines.map((line) => linePhrase(line, format)).join('. ') : '';
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={single ? 'hbar single' : 'hbar'}
                    data-chart-point={point.id}
                    data-series={item.id}
                    aria-label={`${point.label}. ${item.label} ${moneyText(value, format)}. ${lineText}`}
                    onFocus={() => setFocusId(point.id)}
                    onBlur={() => setFocusId('')}
                    onMouseEnter={() => setFocusId(point.id)}
                    onPointerDown={() => setFocusId(point.id)}
                    onMouseLeave={(event) => { if (event.currentTarget !== document.activeElement) setFocusId(''); }}
                  >
                    {!single && <span className="hbar-key">{item.label}</span>}
                    <span className={stacked ? 'hbar-track hbar-stack' : 'hbar-track'}>
                      {stacked ? point.segments.filter((segment) => segment.value != null && Number.isFinite(segment.value)).map((segment) => (
                        <i key={segment.id} data-bar={segment.id} data-state={segment.value === 0 ? 'zero' : 'value'} style={{ width: segment.value === 0 ? undefined : `${(Math.abs(segment.value) / max) * 100}%`, background: segment.color }} />
                      )) : (known ? <i data-bar={item.id} data-state={value === 0 ? 'zero' : 'value'} style={{ width, background: item.color }} /> : null)}
                    </span>
                    <span className="hbar-value">{moneyText(value, format)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="chart-readout" role="status">
        <p>{active ? `${active.label} · ${visible.map((item) => `${item.label} ${moneyText(item.values.find((entry) => entry.id === active.id)?.value, format)}`).join(' · ')}` : name}</p>
        {active?.lines?.length > 0 && (
          <ul>
            {active.lines.map((line) => (
              <li key={`${line.type}-${line.name}`} data-income-line={line.name}>{linePhrase(line, format)}</li>
            ))}
          </ul>
        )}
      </div>
    </figure>
  );
}

export function ComparisonBars({ name, items, format, caption }) {
  const [hidden, setHidden] = useState({});
  const [tip, setTip] = useState(null);
  const tipId = useId();
  const visible = items.filter((item) => !hidden[item.id] && item.value != null);
  const max = Math.max(1, ...visible.map((item) => Math.abs(item.value)));
  return (
    <figure className="chart-card" data-chart={name}>
      <div className="cl" role="group" aria-label={`${name} series`}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="chart-key"
            aria-pressed={!hidden[item.id]}
            onClick={() => setHidden((current) => ({ ...current, [item.id]: !current[item.id] }))}
          >
            <i style={{ background: item.color }} />
            {item.label}
          </button>
        ))}
      </div>
      <div className="chart-bars" role="group" aria-label={name}>
        {visible.map((item) => (
          <button
            key={item.id}
            type="button"
            className="chart-bar"
            data-chart-point={item.id}
            data-series={item.id}
            aria-describedby={tip?.id === item.id ? tipId : undefined}
            onMouseEnter={() => setTip({ id: item.id, text: `${item.label} · ${format(item.value)} · ${item.status}` })}
            onFocus={() => setTip({ id: item.id, text: `${item.label} · ${format(item.value)} · ${item.status}` })}
            onPointerDown={() => setTip({ id: item.id, text: `${item.label} · ${format(item.value)} · ${item.status}` })}
            onBlur={() => setTip(null)}
          >
            <span>{item.label}</span>
            <span className="chart-track"><i style={{ width: `${Math.round((Math.abs(item.value) / max) * 100)}%`, background: item.color }} /></span>
          </button>
        ))}
      </div>
      {tip && <div id={tipId} role="status" className="chart-tip">{tip.text}</div>}
      {caption && <p className="caveat">{caption}</p>}
      <table className="chart-fallback">
        <caption className="sub">{name} values</caption>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}><td>{item.label}</td><td>{item.value == null ? 'Missing information' : format(item.value)}</td><td>{item.status}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
