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
      text: `${point.label} · ${item.label} · ${value?.value == null ? 'Unknown' : format(value.value)} · ${value?.status || 'Unknown'}`,
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
                  aria-label={`${point.label}, ${item.label}, ${value?.value == null ? 'unknown' : format(value.value)}, ${value?.status || 'unknown'}`}
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
                  return <td key={item.id}>{value?.value == null ? 'Unknown' : format(value.value)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
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
            <tr key={item.id}><td>{item.label}</td><td>{item.value == null ? 'Unknown' : format(item.value)}</td><td>{item.status}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
