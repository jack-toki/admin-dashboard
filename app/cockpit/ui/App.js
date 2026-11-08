'use client';
import { useEffect, useState } from 'react';
import { syntheticActuals, syntheticBaseline } from '../../../lib/fixtures/synthetic';
import { validateEntry } from '../../../lib/planning/entries';
import { TokiScreen, AutomationsScreen } from './TokiScreen';
import JrlScreen from './JrlScreen';
import { readCollapsed, toggleCollapsed, visibleNav, NAV_STORAGE_KEY } from '../../../lib/nav/sidebar';
import { readTheme, writeTheme } from '../../../lib/theme';
import { NavMark } from './marks';
import '../jrl.css';
import '../cockpit.css';

export default function App({ role, areas, client }) {
  const [area, setArea] = useState(areas.includes('toki') ? 'toki' : areas[0]);
  const [collapsed, setCollapsed] = useState(false);
  const [status, setStatus] = useState(null);
  const [jrl, setJrl] = useState(null);
  const [example, setExample] = useState(false);
  const [theme, setTheme] = useState('light');
  const [plan, setPlan] = useState([]);
  const [planNote, setPlanNote] = useState('');
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
    if (!areas.includes('toki')) return;
    fetch('/api/cockpit/plan').then(async (res) => {
      if (!res.ok) return;
      const body = await res.json();
      setPlan(body.entries || []);
      setPlanNote(body.shared ? 'Saved in the shared store.' : 'Saved on this server’s local store. Production refuses a file store.');
    });
  }, [areas]);

  useEffect(() => {
    setCollapsed(readCollapsed(window.localStorage));
    try { setTheme(readTheme(window.localStorage)); } catch { setTheme('light'); }
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

  async function onSave(form) {
    const result = validateEntry({
      kind: form.kind,
      amountMinor: Number.isFinite(Number(form.amount)) ? Math.round(Number(form.amount) * 100) : null,
      currency: 'GBP',
      month: form.month,
      party: form.party,
      groupId: form.groupId,
      timing: form.timing,
      durationMonths: form.durationMonths,
      attestation: 'forecast',
    });
    if (!result.ok) {
      setFormError(`Check ${result.errors.join(', ')}.`);
      return;
    }
    const res = await fetch('/api/cockpit/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...form, amount: Number(form.amount), currency: 'GBP', attestation: 'forecast' }),
    });
    if (res.status === 503) {
      setFormError('Shared saving is not configured. The entry was not stored.');
      return;
    }
    if (!res.ok) {
      setFormError('The plan did not save.');
      return;
    }
    const body = await res.json();
    setFormError('');
    setPlanNote(body.shared ? 'Saved in the shared store.' : 'Saved on this server’s local store. Production refuses a file store.');
    setPlan((current) => [...current.filter((entry) => entry.id !== body.entry.id), body.entry]);
  }

  const items = visibleNav(areas);

  async function onSignOut() {
    await fetch('/api/cockpit/login', { method: 'DELETE' });
    window.location.href = '/cockpit/login';
  }

  function onTheme(event) {
    const next = writeTheme(window.localStorage, event.target.checked ? 'dark' : 'light');
    setTheme(next);
    window.dispatchEvent(new Event('jrl-theme'));
  }

  const title = area === 'jrl' ? 'JRL' : area === 'automations' ? 'Automations' : 'Toki';

  return (
    <div className="jrl-root" data-theme={theme === 'dark' ? 'dark' : 'light'}>
      <div className="aura" aria-hidden="true" />
      <div className="app">
        <aside className="side" data-collapsed={collapsed ? 'true' : 'false'} aria-label="Cockpit sections">
          <nav id="cockpit-nav">
            {items.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={area === item.id ? 'on' : undefined}
                aria-current={area === item.id ? 'page' : undefined}
                onClick={(event) => { event.preventDefault(); setArea(item.id); }}
              >
                <span className="ic"><NavMark id={item.id} /></span>
                <span className="lbl">{item.label}</span>
                <span className="lbl-short">{item.label}</span>
                <span className="nav-tip">{item.label}</span>
              </a>
            ))}
          </nav>
          <div className="spacer" />
          <button type="button" className="toggle glass" aria-label={collapsed ? 'Expand menu' : 'Collapse menu'} onClick={onToggleNav}>{collapsed ? '»' : '«'}</button>
          <div className="help"><b>Example data stays off</b><span>Turn it on only to preview the layout. Press [ to collapse the menu ({NAV_STORAGE_KEY}).</span></div>
        </aside>
        <main className="main">
          <div className="head">
            <div>
              <h1>{title}</h1>
              <div className="period">{role}{client ? ` · ${client}` : ''}</div>
            </div>
            <div className="head-actions">
              {area !== 'jrl' && <button type="button" className="toggle glass" onClick={() => setExample((value) => !value)}>{example ? 'Hide example data' : 'Show example data'}</button>}
              <label className="theme-switch">
                <span>Dark</span>
                <input type="checkbox" role="switch" aria-checked={theme === 'dark'} checked={theme === 'dark'} onChange={onTheme} />
              </label>
              <button type="button" className="toggle glass signout" onClick={onSignOut}>Sign out</button>
            </div>
          </div>
          {area === 'toki' && <TokiScreen example={example} baseline={baseline} actuals={actuals} plan={plan} planNote={planNote} onSave={onSave} formError={formError} />}
          {area === 'automations' && (
            <>
              <AutomationsScreen example={example} />
              {status && <p className="caveat">The ingest alias was not called. The last export snapshot recorded {status.coverage.clientOnWithIngest} of {status.coverage.clientOn} client workflows on, and {status.coverage.jackOwnOnWithIngest} of {status.coverage.jackOwnOn} on Jack’s own account. Louise was {status.coverage.louise}.</p>}
            </>
          )}
          {area === 'jrl' && <JrlScreen gate={jrl} />}
        </main>
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
    setResult(res.ok ? `Saved in the ${body.backend} store. A Zapier listener is not installed.` : body.error === 'store_not_configured' ? 'Registration needs a configured store. Nothing was kept in memory.' : 'Registration was not accepted.');
  }
  return (
    <form onSubmit={onSubmit} style={formGrid}>
      <input aria-label="Workflow title" placeholder="Workflow title" value={title} onChange={(event) => setTitle(event.target.value)} style={input} />
      <button style={button} type="submit">Register workflow</button>
      {result && <p>{result}</p>}
    </form>
  );
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
