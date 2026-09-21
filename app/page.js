'use client';
import React, { useState, useMemo, useEffect } from 'react';

const ACCENT = '#ec5a29';
const LIGHT = {
  page: 'linear-gradient(158deg,#d6e2f1 0%,#e8e7f2 46%,#d9ece1 100%)',
  tile: 'rgba(255,255,255,0.72)', tileBorder: 'rgba(20,24,40,0.07)',
  panel: 'rgba(255,255,255,0.55)', panelBorder: 'rgba(20,24,40,0.06)',
  head: 'rgba(255,255,255,0.45)', rowLine: 'rgba(20,24,40,0.06)',
  ink: '#181b24', muted: '#6b7280', faint: '#9aa1ad', footer: 'rgba(255,255,255,0.42)', menu: '#ffffff',
};
const DARK = {
  page: 'linear-gradient(158deg,#191c27 0%,#1f2230 50%,#182320 100%)',
  tile: 'rgba(255,255,255,0.05)', tileBorder: 'rgba(255,255,255,0.09)',
  panel: 'rgba(255,255,255,0.035)', panelBorder: 'rgba(255,255,255,0.08)',
  head: 'rgba(255,255,255,0.05)', rowLine: 'rgba(255,255,255,0.07)',
  ink: '#f2f4f8', muted: '#9aa2b1', faint: '#6b7480', footer: 'rgba(255,255,255,0.04)', menu: '#20232f',
};
const COLS = [
  { key: 'client', label: 'Client', kind: 'client', align: 'left' },
  { key: 'automationsLive', label: 'Automations live', kind: 'num' },
  { key: 'runs', label: 'Runs', kind: 'num' },
  { key: 'estHoursSaved', label: 'Est. time saved', kind: 'hours' },
  { key: 'estValueSaved', label: 'Est. £ saved', kind: 'money' },
  { key: 'usageTrend', label: 'Usage trend', kind: 'spark', sortable: false },
  { key: 'mostRunAutomation', label: 'Most-run automation', kind: 'most', align: 'left' },
  { key: 'emailsSent', label: 'Emails sent', kind: 'num' },
  { key: 'quotesSent', label: 'Quotes sent', kind: 'num' },
  { key: 'invoicesSent', label: 'Invoices sent', kind: 'num' },
  { key: 'documentsSent', label: 'Documents sent', kind: 'num' },
  { key: 'leads', label: 'Leads', kind: 'num' },
  { key: 'adminTasks', label: 'Auto-Admin', kind: 'num' },
];
const PERIODS = [['Today', 'today'], ['This month', 'this-month'], ['Last month', 'last-month'], ['90 days', '90-days'], ['All time', 'all-time']];

function Spark({ data, color }) {
  if (!data || data.length < 2) return <span style={{ color }}>—</span>;
  const w = 92, h = 26, pad = 3;
  const max = Math.max(...data), min = Math.min(...data), rng = (max - min) || 1;
  const pts = data.map((v, i) => [pad + (i * (w - 2 * pad)) / (data.length - 1), h - pad - ((v - min) / rng) * (h - 2 * pad)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.1" fill={color} />
    </svg>
  );
}
function shortTitle(s) { const p = (s || '').split('|').map((x) => x.trim()); return p.length > 1 ? p.slice(1).join(' · ') : s; }

export default function Page() {
  const [dark, setDark] = useState(false);
  const [sort, setSort] = useState({ key: 'runs', dir: 'desc' });
  const [period, setPeriod] = useState('this-month');
  const [menuOpen, setMenuOpen] = useState(false);
  const [hidden, setHidden] = useState({});
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');
  const t = dark ? DARK : LIGHT;

  useEffect(() => {
    setState('loading');
    fetch(`/api/dashboard?period=${period}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setState((d.clients && d.clients.length) ? 'ready' : 'empty'); })
      .catch(() => setState('error'));
  }, [period]);

  const visibleCols = COLS.filter((c) => !hidden[c.key]);
  const fmt = (v) => Number(v).toLocaleString();
  const sortVal = (c, key) => key === 'client' ? c.client.toLowerCase() : key === 'mostRunAutomation' ? (c.mostRunAutomation?.count || 0) : c[key];
  const rows = useMemo(() => {
    if (!data?.clients) return [];
    return [...data.clients].sort((a, b) => {
      const av = sortVal(a, sort.key), bv = sortVal(b, sort.key);
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [data, sort]);
  const onSort = (col) => { if (col.sortable === false) return; setSort((s) => s.key === col.key ? { key: col.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: col.key, dir: (col.kind === 'client' || col.kind === 'most') ? 'asc' : 'desc' }); };

  const cell = (c, col) => {
    switch (col.kind) {
      case 'client': return <span style={{ fontWeight: 600 }}>{c.client}</span>;
      case 'hours': return <span>{c.estHoursSaved}<span style={{ color: t.faint, fontSize: 11 }}> h</span></span>;
      case 'money': return <span>£{fmt(c.estValueSaved)}</span>;
      case 'spark': return <Spark data={c.usageTrend} color={ACCENT} />;
      case 'most': return c.mostRunAutomation ? (
        <span style={{ color: t.muted }}>
          <span title={c.mostRunAutomation.title} style={{ display: 'inline-block', maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>{shortTitle(c.mostRunAutomation.title)}</span>
          <span style={{ color: t.faint }}> ({c.mostRunAutomation.count})</span>
        </span>) : <span style={{ color: t.faint }}>—</span>;
      default: { const v = c[col.key]; return <span style={{ color: v === 0 ? t.faint : t.ink }}>{v}</span>; }
    }
  };
  const totalCell = (col) => {
    const T = data?.totals || {};
    switch (col.kind) {
      case 'client': return `All clients (${T.clientAccounts || 0})`;
      case 'hours': return `${T.estHoursSaved || 0}h`;
      case 'money': return `£${fmt(T.estValueSaved || 0)}`;
      case 'spark': case 'most': return '';
      default: return fmt(T[col.key] || 0);
    }
  };

  const T = data?.totals;
  const tiles = T ? [
    { label: 'Client accounts', value: T.clientAccounts, accent: true },
    { label: 'Automations live', value: T.automationsLive },
    { label: 'Runs this month', value: fmt(T.runs) },
    { label: 'Est. time saved', value: T.estHoursSaved, suffix: 'hrs' },
    { label: 'Est. value saved', value: `£${fmt(T.estValueSaved)}` },
    { label: 'Auto-Admin tasks', value: fmt(T.adminTasks) },
  ] : [];

  return (
    <div style={{ background: t.page, minHeight: '100vh', padding: '22px 20px 40px', fontFamily: "'Inter',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif", color: t.ink, boxSizing: 'border-box' }}>
      <style>{`.zt-scroll::-webkit-scrollbar{height:8px}.zt-scroll::-webkit-scrollbar-thumb{background:rgba(120,120,140,.35);border-radius:8px}.zt-row:hover{background:${dark ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.4)'}}.zt-th{cursor:pointer;user-select:none;transition:color .15s}.zt-th:hover{color:${ACCENT}}`}</style>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 2, padding: 4, borderRadius: 12, background: t.tile, border: `1px solid ${t.tileBorder}` }}>
            {PERIODS.map(([label, val]) => {
              const active = val === period;
              return <button key={val} onClick={() => setPeriod(val)} style={{ border: 'none', background: active ? (dark ? '#2c3040' : '#fff') : 'transparent', color: active ? t.ink : t.muted, fontSize: 13, fontWeight: active ? 600 : 500, padding: '6px 13px', borderRadius: 9, cursor: 'pointer', boxShadow: active ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }}>{label}</button>;
            })}
          </div>
        </div>

        {state === 'loading' && <div style={{ color: t.muted, padding: '60px 0', textAlign: 'center' }}>Loading…</div>}
        {state === 'error' && <div style={{ color: t.muted, padding: '60px 0', textAlign: 'center' }}>Couldn’t load data. Check the API and env vars.</div>}
        {state === 'empty' && (
          <div style={{ background: t.tile, border: `1px solid ${t.tileBorder}`, borderRadius: 16, padding: '48px 28px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No runs logged yet</div>
            <div style={{ color: t.muted, fontSize: 14, maxWidth: 460, margin: '0 auto' }}>Add the webhook step to a Zap and let it run once. Each run posts here and appears within a minute.</div>
          </div>
        )}

        {state === 'ready' && (<>
          <div style={{ display: 'grid', gap: 14, marginBottom: 22, gridTemplateColumns: 'repeat(auto-fit,minmax(178px,1fr))' }}>
            {tiles.map((s) => (
              <div key={s.label} style={{ background: t.tile, borderRadius: 16, padding: '16px 18px', border: `1px solid ${s.accent ? 'rgba(236,90,41,.4)' : t.tileBorder}` }}>
                <div style={{ fontSize: 13, color: t.muted, marginBottom: 8 }}>{s.label}</div>
                <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', color: s.accent ? ACCENT : t.ink, lineHeight: 1 }}>
                  {s.value}{s.suffix && <span style={{ fontSize: 15, fontWeight: 500, color: t.muted }}> {s.suffix}</span>}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: t.muted }}>Live from your run log · click a column to sort</div>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setMenuOpen((o) => !o)} style={{ background: t.menu, border: `1px solid ${t.panelBorder}`, color: t.ink, fontSize: 13, fontWeight: 500, padding: '7px 13px', borderRadius: 9, cursor: 'pointer' }}>Columns</button>
              {menuOpen && (
                <div style={{ position: 'absolute', right: 0, top: 40, background: t.menu, zIndex: 20, border: `1px solid ${t.panelBorder}`, borderRadius: 12, padding: 8, width: 210, boxShadow: '0 10px 30px rgba(0,0,0,.18)' }}>
                  {COLS.filter((c) => c.kind !== 'client').map((c) => (
                    <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', borderRadius: 7, fontSize: 13, cursor: 'pointer', color: t.ink }}>
                      <input type="checkbox" checked={!hidden[c.key]} style={{ accentColor: ACCENT }} onChange={() => setHidden((h) => ({ ...h, [c.key]: !h[c.key] }))} />{c.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="zt-scroll" style={{ overflowX: 'auto', background: t.panel, border: `1px solid ${t.panelBorder}`, borderRadius: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 940 }}>
              <thead><tr style={{ background: t.head }}>
                {visibleCols.map((col) => {
                  const active = sort.key === col.key;
                  return <th key={col.key} onClick={() => onSort(col)} className={col.sortable === false ? '' : 'zt-th'} style={{ textAlign: col.align === 'left' ? 'left' : 'right', padding: '13px 16px', fontSize: 12.5, fontWeight: 600, color: active ? ACCENT : t.muted, whiteSpace: 'nowrap', borderBottom: `1px solid ${t.rowLine}` }}>{col.label}{active && <span style={{ fontSize: 9 }}>{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>}</th>;
                })}
              </tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.client} className="zt-row">
                    {visibleCols.map((col) => <td key={col.key} style={{ textAlign: col.align === 'left' ? 'left' : 'right', padding: '15px 16px', fontSize: 14, whiteSpace: 'nowrap', borderBottom: `1px solid ${t.rowLine}` }}>{cell(c, col)}</td>)}
                  </tr>
                ))}
                <tr style={{ background: t.footer }}>
                  {visibleCols.map((col) => <td key={col.key} style={{ textAlign: col.align === 'left' ? 'left' : 'right', padding: '14px 16px', fontSize: 14, fontWeight: 600, color: col.kind === 'client' ? t.muted : t.ink, whiteSpace: 'nowrap' }}>{totalCell(col)}</td>)}
                </tr>
              </tbody>
            </table>
          </div>

          {data.unprofiled?.length > 0 && (
            <div style={{ marginTop: 14, fontSize: 13, color: t.muted }}>
              {data.unprofiled.length} automation{data.unprofiled.length > 1 ? 's' : ''} not in the sheet yet: {data.unprofiled.slice(0, 4).map((u) => `${u.title} (${u.runs})`).join(', ')}{data.unprofiled.length > 4 ? '…' : ''} — add a row to count their outputs.
            </div>
          )}
        </>)}

        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15, color: dark ? t.faint : ACCENT }}>☀</span>
          <button onClick={() => setDark((d) => !d)} aria-label="Toggle theme" style={{ width: 46, height: 24, borderRadius: 20, border: 'none', cursor: 'pointer', background: dark ? '#3a3f4f' : '#e8e5ee', position: 'relative', padding: 0 }}>
            <span style={{ position: 'absolute', top: 3, left: dark ? 25 : 3, width: 18, height: 18, borderRadius: '50%', background: ACCENT, transition: 'left .18s' }} />
          </button>
          <span style={{ fontSize: 15, color: dark ? ACCENT : t.faint }}>☾</span>
        </div>
      </div>
    </div>
  );
}
