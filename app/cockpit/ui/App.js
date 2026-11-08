'use client';
import { useEffect, useMemo, useState } from 'react';
import { syntheticActuals, syntheticBaseline, SYNTHETIC_BANNER } from '../../../lib/fixtures/synthetic';
import { comparePair } from '../../../lib/pnl/variance';
import { validateEntry, expandTimeline, salesFromCrm } from '../../../lib/planning/entries';
import { formatMinor } from '../../../lib/money';
import { readCollapsed, toggleCollapsed, visibleNav, NAV_STORAGE_KEY } from '../../../lib/nav/sidebar';
import { NavMark } from './marks';
import '../cockpit.css';

export default function App({ role, areas, client }) {
  const [area, setArea] = useState(areas.includes('toki') ? 'toki' : areas[0]);
  const [collapsed, setCollapsed] = useState(false);
  const [status, setStatus] = useState(null);
  const [jrl, setJrl] = useState(null);
  const [example, setExample] = useState(false);
  const [plan, setPlan] = useState([]);
  const [month, setMonth] = useState('2026-01');
  const [form, setForm] = useState({ kind: 'sale', amount: '', currency: 'GBP', month: '2026-01', party: '', groupId: 'billing', timing: 'one_off', durationMonths: '3', attestation: 'forecast' });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    fetch('/api/cockpit/workspace').then(async (res) => {
      if (res.status === 401) window.location.href = '/cockpit/login';
      else setStatus(await res.json());
    }).catch(() => setStatus({ error: 'workspace_unavailable' }));
  }, []);

  useEffect(() => {
    if (area !== 'jrl') return;
    fetch('/api/cockpit/jrl').then(async (res) => setJrl({ status: res.status, body: await res.json() }));
  }, [area]);

  useEffect(() => {
    setCollapsed(readCollapsed(window.localStorage));
    function onKey(event) {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable) return;
      if (event.key === '[') {
        event.preventDefault();
        setCollapsed(toggleCollapsed(window.localStorage));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function onToggleNav() {
    setCollapsed(toggleCollapsed(window.localStorage));
  }

  const baseline = example ? syntheticBaseline() : null;
  const actuals = example ? syntheticActuals() : null;
  const revenue = useMemo(() => {
    if (!baseline || !actuals) return null;
    const forecast = sumKind(baseline, 'revenue', month);
    const actual = actuals.months[month];
    return comparePair({
      kind: 'revenue',
      forecastMinor: forecast,
      actualMinor: actual ? actual.billing : null,
      actualKnown: Boolean(actual && actual.billing != null),
      actualCoverage: actual?.coverage || 'missing',
      basis: 'unknown',
      vat: 'unknown',
    });
  }, [baseline, actuals, month]);

  function addEntry(event) {
    event.preventDefault();
    const pounds = Number(form.amount);
    const result = validateEntry({
      kind: form.kind,
      amountMinor: Number.isFinite(pounds) ? Math.round(pounds * 100) : null,
      currency: form.currency,
      month: form.month,
      party: form.party,
      groupId: form.groupId,
      timing: form.timing,
      durationMonths: form.durationMonths,
      attestation: form.attestation,
    });
    if (!result.ok) {
      setFormError(`Check ${result.errors.join(', ')}.`);
      return;
    }
    setFormError('');
    setPlan((current) => [...current, result.entry]);
  }

  const items = visibleNav(areas);

  return (
    <div style={page}>
      <div className="cockpit-shell">
      <nav className="glass-nav" data-collapsed={collapsed ? 'true' : 'false'} aria-label="Cockpit sections">
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={!collapsed}
          aria-controls="cockpit-nav"
          aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
          onClick={onToggleNav}
        >
          <span aria-hidden="true">{collapsed ? '»' : '«'}</span>
          <span className="nav-label">{collapsed ? 'Expand menu' : 'Collapse menu'}</span>
          <span className="nav-tip" role="tooltip">{collapsed ? 'Expand menu' : 'Collapse menu'}</span>
        </button>
        <ul id="cockpit-nav">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={area === item.id ? 'nav-item is-current' : 'nav-item'}
                aria-current={area === item.id ? 'page' : undefined}
                aria-label={item.label}
                title={item.hint}
                onClick={() => setArea(item.id)}
              >
                <NavMark id={item.id} />
                <span className="nav-label">{item.label}</span>
                <span className="nav-tip" role="tooltip">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="cockpit-main">
      <header style={header}>
        <div>
          <div style={kicker}>Toki cockpit</div>
          <strong>{role}{client ? ` · ${client}` : ''}</strong>
        </div>
        <span style={meta}>Menu preference is saved on this device ({NAV_STORAGE_KEY}). Press [ to toggle it.</span>
      </header>

      {area === 'toki' && (
        <section>
          <div style={banner}>Live forecast, Xero, and ClickUp are not connected. Figures appear only in the labelled synthetic example.</div>
          <div style={row}>
            <button style={button} onClick={() => setExample((value) => !value)}>{example ? 'Hide synthetic example' : 'Show synthetic example'}</button>
            <span style={meta}>Manual sales only. A CRM “won” status does not add a sale ({salesFromCrm().length}).</span>
          </div>
          {example && (
            <>
              <p style={banner}>{SYNTHETIC_BANNER}</p>
              <h2 style={h2}>First tab — Forecast Profit & Loss</h2>
              <p>{baseline.grossProfitMeaning}</p>
              {baseline.anomaly && <p style={warn}>{baseline.anomaly.message} Omitted rows: {baseline.anomaly.omittedFrom[0].omittedRows.join(', ')}.</p>}
              <div style={tableWrap}>
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Line</th>
                      {baseline.months.map((item) => <th key={item.key} style={th}><button style={link} onClick={() => setMonth(item.key)}>{item.header}</button></th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {baseline.rows.map((item) => (
                      <tr key={item.rowNumber}>
                        <td style={td}>{item.label}{item.group && !item.group.sourceConfirmed ? ' · suggested' : ''}</td>
                        {baseline.months.map((col) => <td key={col.key} style={tdNum}>{item.cells[col.key]?.blank ? '—' : formatMinor(item.cells[col.key].minor)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h2 style={h2}>Actual versus first-tab forecast · {month}</h2>
              <p>Accounting basis and VAT are unknown, so this is not a like-for-like result. People actuals are missing, not zero. August in the example is partial.</p>
              {revenue && (
                <p>
                  Raw difference (actual − forecast): {revenue.rawDifference == null ? 'withheld' : formatMinor(revenue.rawDifference)}.
                  {' '}Judgement: {revenue.judgement}. {revenue.percent == null ? 'Percent withheld.' : `Percent ${(revenue.percent * 100).toFixed(1)}%.`}
                </p>
              )}
              <h2 style={h2}>Add a plan entry</h2>
              <form onSubmit={addEntry} style={formGrid}>
                <select aria-label="Kind" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })} style={input}>
                  <option value="sale">Sale</option>
                  <option value="cost">Cost</option>
                </select>
                <input aria-label="Amount" placeholder="Amount" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} style={input} />
                <input aria-label="Party" placeholder={form.kind === 'sale' ? 'Client' : 'Vendor'} value={form.party} onChange={(event) => setForm({ ...form, party: event.target.value })} style={input} />
                <select aria-label="Group" value={form.groupId} onChange={(event) => setForm({ ...form, groupId: event.target.value })} style={input}>
                  <option value="billing">Billing</option>
                  <option value="administration">Administration</option>
                  <option value="people">People</option>
                  <option value="ungrouped">Ungrouped</option>
                </select>
                <select aria-label="Timing" value={form.timing} onChange={(event) => setForm({ ...form, timing: event.target.value })} style={input}>
                  <option value="one_off">One-off</option>
                  <option value="recurring">Recurring</option>
                </select>
                <select aria-label="Attestation" value={form.attestation} onChange={(event) => setForm({ ...form, attestation: event.target.value })} style={input}>
                  <option value="forecast">Forecast</option>
                  <option value="invoiced">Invoiced — manual attestation</option>
                  <option value="paid">Paid — manual attestation, not Xero</option>
                </select>
                <button style={button} type="submit">Save on this page</button>
              </form>
              {formError && <p role="alert">{formError}</p>}
              <p style={meta}>Saved in this browser session only. Not written to the sheet, Xero, or Supabase.</p>
              <ul>
                {plan.map((entry) => (
                  <li key={entry.id}>{entry.kind} {formatMinor(entry.amountMinor, entry.currency)} · {entry.party} · {expandTimeline(entry).join(', ')} · {entry.attestation} · manual, not Xero</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {area === 'automations' && status && (
        <section>
          <h2 style={h2}>Run monitoring</h2>
          <p>Legacy posts still go to <code>POST https://{status.ingest.aliasHost}{status.ingest.path}</code> with header <code>{status.ingest.header}</code>. That alias was not called from here. The evidence is a Zap export snapshot at {status.coverage.capturedAt}.</p>
          <ul>
            <li>Client accounts in that snapshot: {status.coverage.clientOnWithIngest} of {status.coverage.clientOn} ON Zaps included the ingest step.</li>
            <li>Jack’s own ON Zaps in that snapshot: {status.coverage.jackOwnOnWithIngest} of {status.coverage.jackOwnOn}.</li>
            <li>Louise: {status.coverage.louise}. Other clients: {status.coverage.otherClients}.</li>
            <li>Reported new-workflow count {status.coverage.newWorkflowCountReported.value} is an {status.coverage.newWorkflowCountReported.status.replaceAll('_', ' ')}.</li>
            <li>Time and money use a code assumption of {status.assumptions.minutesPerRun} minutes and £{status.assumptions.hourlyRate}/hour. The profiles sheet does not store those weights. ZapId was blank on the snapshot rows, so a title match is fragile.</li>
            <li>Legacy posts have no run id. Checkpoint posts are not unique runs, and repeats are not removed just because the Zap id matches.</li>
            <li>Zapier onboarding: {status.zapier.state}. Listener installed: {String(status.zapier.listenerInstalled)}.</li>
          </ul>
          <RegisterForm />
        </section>
      )}

      {area === 'jrl' && (
        <section>
          <h2 style={h2}>JRL personal</h2>
          <p>This area is separate from the Toki board. It is not included in Toki exports.</p>
          {jrl?.status === 403 && <p>This sign-in cannot open personal finances.</p>}
          {jrl?.status === 200 && (
            <>
              <p>{jrl.body.source.blocker}</p>
              <p>Repository readable from here: {String(jrl.body.source.repoVisible)}. Personal entries loaded: {jrl.body.entries.length}.</p>
              <ul>
                {(jrl.body.source.aliases || []).map((alias) => (
                  <li key={alias}>{alias} — Vercel SSO, no custom domain</li>
                ))}
              </ul>
              <p>A phone lock-screen shortcut is not part of this site. These pages stay ordinary authenticated web routes.</p>
            </>
          )}
        </section>
      )}
      </div>
      </div>
    </div>
  );
}

function RegisterForm() {
  const [title, setTitle] = useState('');
  const [result, setResult] = useState('');
  async function onSubmit(event) {
    event.preventDefault();
    const res = await fetch('/api/automations/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountSlug: 'example-client', zapId: 'zap-example', title, owner: 'Toki' }),
    });
    const body = await res.json();
    setResult(res.ok ? `Registered in process memory only. Zapier listener: ${body.zapier.listenerInstalled}.` : 'Registration was not accepted.');
  }
  return (
    <form onSubmit={onSubmit} style={formGrid}>
      <input aria-label="Workflow title" placeholder="Workflow title" value={title} onChange={(event) => setTitle(event.target.value)} style={input} />
      <button style={button} type="submit">Register workflow</button>
      {result && <p>{result}</p>}
    </form>
  );
}

function sumKind(model, kind, month) {
  let total = 0;
  let seen = 0;
  for (const row of model.rows) {
    if (row.kind !== kind) continue;
    const cell = row.cells[month];
    if (!cell || cell.blank || cell.minor == null) continue;
    total += cell.minor;
    seen += 1;
  }
  return seen ? total : null;
}

const page = { minHeight: '100vh', background: 'linear-gradient(158deg,#d6e2f1 0%,#e8e7f2 46%,#d9ece1 100%)', color: '#181b24', fontFamily: "'Inter',ui-sans-serif,system-ui,sans-serif", padding: '22px 20px 40px' };
const header = { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'end', marginBottom: 18, flexWrap: 'wrap' };
const kicker = { letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 12, color: '#6b7280' };
const h2 = { fontSize: 18, fontWeight: 600, margin: '18px 0 8px' };
const banner = { background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(20,24,40,0.07)', borderRadius: 16, padding: '14px 16px' };
const warn = { color: '#6b7280', fontSize: 14 };
const row = { display: 'flex', gap: 12, alignItems: 'center', margin: '12px 0', flexWrap: 'wrap' };
const button = { background: '#fff', color: '#181b24', border: '1px solid rgba(20,24,40,0.07)', borderRadius: 9, boxShadow: '0 1px 2px rgba(0,0,0,.08)', padding: '8px 12px', font: 'inherit', fontWeight: 600, cursor: 'pointer' };
const meta = { color: '#6b7280', fontSize: 13 };
const tableWrap = { overflowX: 'auto', background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(20,24,40,0.06)', borderRadius: 16 };
const table = { borderCollapse: 'collapse', width: '100%', minWidth: 640 };
const th = { textAlign: 'left', padding: '13px 16px', borderBottom: '1px solid rgba(20,24,40,0.06)', fontSize: 12.5, color: '#6b7280' };
const td = { padding: '14px 16px', borderTop: '1px solid rgba(20,24,40,0.06)', fontSize: 14 };
const tdNum = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const link = { background: 'none', border: 0, padding: 0, font: 'inherit', fontWeight: 600, cursor: 'pointer', color: '#181b24' };
const formGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, alignItems: 'center' };
const input = { border: '1px solid rgba(20,24,40,0.07)', borderRadius: 9, padding: '8px 10px', font: 'inherit', background: '#fff' };
