'use client';
import { Fragment, useEffect, useState } from 'react';
import { validateEntry } from '../../../lib/planning/entries';
import { TokiScreen, AutomationsScreen } from './TokiScreen';
import { OverviewScreen } from './OverviewScreen';
import { ForecastScreen } from './ForecastScreen';
import { currentTokiMonth, deriveAutoTasks, forecastCellsFromRows } from '../../../lib/planning/autoTasks';
import JrlScreen from './JrlScreen';
import { readCollapsed, toggleCollapsed, visibleNav, NAV_STORAGE_KEY, TOKI_VIEWS } from '../../../lib/nav/sidebar';
import { readTheme, writeTheme } from '../../../lib/theme';
import { NavMark } from './marks';
import { syntheticBaseline } from '../../../lib/fixtures/synthetic';
import { exampleEntries } from '../../../lib/jrl/example';
import '../jrl.css';
import '../cockpit.css';

export default function App({ role, areas, client, fixture = false }) {
  const [area, setArea] = useState(areas.includes('toki') ? 'toki' : areas[0]);
  const [tokiView, setTokiView] = useState('toki');
  const [collapsed, setCollapsed] = useState(false);
  const [status, setStatus] = useState(null);
  const [jrl, setJrl] = useState(null);
  const [theme, setTheme] = useState('light');
  const [plan, setPlan] = useState([]);
  const [details, setDetails] = useState([]);
  const [detailStored, setDetailStored] = useState(false);
  const [outstanding, setOutstanding] = useState([]);
  const [dismissals, setDismissals] = useState([]);
  const [outstandingStored, setOutstandingStored] = useState(false);
  const [planNote, setPlanNote] = useState('');
  const [formError, setFormError] = useState('');
  const [storedForecast, setStoredForecast] = useState(null);
  const [evidence, setEvidence] = useState(null);
  const [forecastError, setForecastError] = useState('');
  const [runBoard, setRunBoard] = useState(null);
  const [runError, setRunError] = useState('');
  const [jrlLoading, setJrlLoading] = useState(!fixture);
  const [runsLoading, setRunsLoading] = useState(!fixture);
  const [focus, setFocus] = useState(null);

  function openSpace(target) {
    if (!target || typeof target === 'string') {
      const next = target || 'toki';
      setArea(next);
      if (next === 'toki') setTokiView('toki');
      setFocus(null);
      return;
    }
    setArea(target.area);
    if (target.area === 'toki') setTokiView(target.section || 'toki');
    setFocus(target);
  }

  useEffect(() => {
    if (!fixture) return;
    setStoredForecast(syntheticBaseline());
    setForecastError('');
    setPlan([]);
    setDetails([
      { id: 'syn-retainer', kind: 'retainer', party: 'Example Studio', services: 'Design', amountMinor: 150000, firstPaymentMonth: '2026-01', contractEndDate: '2026-06-30', totalPayments: 6, comment: 'Scheduled 2 of 6', source: 'manual' },
      { id: 'syn-retainer-2', kind: 'retainer', party: 'Northwind', services: 'Support', amountMinor: 80000, firstPaymentMonth: '2026-01', contractEndDate: '2027-01-15', contractEndUnknown: false, comment: '', source: 'manual' },
      { id: 'syn-project', kind: 'project', party: 'Example Launch', services: 'Site', amountMinor: 240000, firstPaymentMonth: '2026-03', contractEndDate: '2026-05-31', totalPayments: 3, comment: '', source: 'manual' },
      { id: 'syn-project-2', kind: 'project', party: 'Harbour', services: 'Film', amountMinor: null, firstPaymentMonth: '', contractEndDate: null, comment: 'Scheduled 1 of 4', source: 'manual' },
    ]);
    setDetailStored(true);
    setRunBoard({
      posts: 12,
      zapRows: [
        { zapId: 'inv', title: 'Send invoice', account: 'Example Studio', runs: 8 },
        { zapId: 'mail', title: 'Send email', account: 'Northwind', runs: 4 },
      ],
      daily: [],
    });
    setJrl({ status: 200, body: { entries: exampleEntries(), source: { connected: true, ledger: 'readable' }, auth: { supabaseUser: true, ownerLink: true } } });
  }, [fixture]);

  useEffect(() => {
    if (fixture) return;
    fetch('/api/cockpit/workspace').then(async (res) => {
      if (res.status === 401) window.location.href = '/cockpit/login';
      else setStatus(await res.json());
    }).catch(() => setStatus({ error: 'workspace_unavailable' }));
  }, [fixture]);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash === '#jrl' && areas.includes('jrl')) setArea('jrl');
    if (hash === '#money' || hash === '#sources') {
      setArea('toki');
      setTokiView('sources');
    }
    if (hash === '#forecast' && areas.includes('toki')) setArea('forecast');
    if (hash === '#outstanding' && areas.includes('toki')) {
      setArea('toki');
      setTokiView('toki');
      setFocus({ area: 'toki', section: 'toki', scroll: 'outstanding' });
    }
  }, [areas]);

  useEffect(() => {
    if (fixture) return undefined;
    let cancel = false;
    setJrlLoading(true);
    fetch('/api/cockpit/jrl').then(async (res) => {
      if (cancel) return;
      setJrl({ status: res.status, body: await res.json().catch(() => ({})) });
    }).catch(() => {
      if (!cancel) setJrl({ status: 0, body: {} });
    }).finally(() => {
      if (!cancel) setJrlLoading(false);
    });
    return () => { cancel = true; };
  }, [fixture]);

  useEffect(() => {
    if (fixture) return undefined;
    let cancel = false;
    setRunsLoading(true);
    fetch('/api/cockpit/automations').then(async (res) => {
      if (cancel) return;
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.summary) {
        setRunBoard(null);
        setRunError(body.error || 'run_log_unreadable');
        return;
      }
      setRunError('');
      setRunBoard(body.summary);
    }).catch(() => {
      if (cancel) return;
      setRunBoard(null);
      setRunError('run_log_unreadable');
    }).finally(() => {
      if (!cancel) setRunsLoading(false);
    });
    return () => { cancel = true; };
  }, [fixture]);

  useEffect(() => {
    if (fixture || !areas.includes('toki')) return;
    fetch('/api/cockpit/forecast').then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStoredForecast(null);
        setEvidence(null);
        setForecastError(body.error || 'store_unavailable');
        return;
      }
      setForecastError('');
      setStoredForecast(body.model?.rows?.length ? body.model : null);
      setEvidence(body.evidence || null);
    }).catch(() => {
      setStoredForecast(null);
      setEvidence(null);
      setForecastError('store_unavailable');
    });
  }, [areas]);

  useEffect(() => {
    if (fixture || !areas.includes('toki')) return;
    fetch('/api/cockpit/plan').then(async (res) => {
      if (!res.ok) return;
      const body = await res.json();
      setPlan(body.entries || []);
      setPlanNote(body.shared ? 'Saved in the shared store.' : 'Saved on this server’s local store. Production refuses a file store.');
    });
  }, [areas]);

  useEffect(() => {
    if (fixture || !areas.includes('toki')) return;
    fetch('/api/cockpit/income-detail').then(async (res) => {
      if (!res.ok) return;
      const body = await res.json();
      setDetails(body.records || []);
      setDetailStored(body.stored === true);
    }).catch(() => setDetailStored(false));
  }, [areas, fixture]);

  useEffect(() => {
    if (fixture || !areas.includes('toki')) return;
    fetch('/api/cockpit/outstanding').then(async (res) => {
      if (!res.ok) return;
      const body = await res.json();
      setOutstanding(body.items || []);
      setDismissals(body.dismissals || []);
      setOutstandingStored(body.stored === true);
    }).catch(() => setOutstandingStored(false));
  }, [areas, fixture]);

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

  const baseline = storedForecast;
  const actuals = evidence?.actuals || null;

  async function onSave(form) {
    const result = validateEntry({
      id: form.id || undefined,
      kind: form.kind,
      amountMinor: Number.isFinite(Number(form.amount)) ? Math.round(Number(form.amount) * 100) : null,
      currency: 'GBP',
      month: form.month,
      party: form.party,
      groupId: form.groupId,
      timing: form.timing || 'one_off',
      durationMonths: form.durationMonths,
      attestation: 'forecast',
      matchId: form.matchId || null,
      stage: form.kind === 'sale' ? (form.workType || null) : null,
    });
    if (!result.ok) {
      setFormError(`Check ${result.errors.join(', ')}.`);
      return false;
    }
    const res = await fetch('/api/cockpit/plan', {
      method: form.id ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...form, id: form.id, amount: Number(form.amount), currency: 'GBP', attestation: 'forecast', matchId: form.matchId || null, stage: form.kind === 'sale' ? (form.workType || null) : null }),
    });
    if (res.status === 503) {
      setFormError('Shared saving is not configured. The entry was not stored.');
      return false;
    }
    if (!res.ok) {
      setFormError('The plan did not save.');
      return false;
    }
    const body = await res.json();
    setFormError('');
    setPlanNote(body.shared ? 'Saved in the shared store.' : 'Saved on this server’s local store. Production refuses a file store.');
    setPlan((current) => [...current.filter((entry) => entry.id !== body.entry.id), body.entry]);
    return true;
  }

  async function onSaveDetail(form) {
    const res = await fetch('/api/cockpit/income-detail', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.record) {
      setFormError(body.error === 'income_detail_schema_required' ? 'Client lines are not saved on this server yet.' : 'That client line was not saved.');
      return false;
    }
    setFormError('');
    setDetails((current) => [...current.filter((row) => row.id !== body.record.id), body.record]);
    return true;
  }

  async function onRemoveDetail(id) {
    const res = await fetch('/api/cockpit/income-detail', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      setFormError('That client line was not removed.');
      return;
    }
    setDetails((current) => current.filter((row) => row.id !== id));
  }

  async function onAddOutstanding(title) {
    const res = await fetch('/api/cockpit/outstanding', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.item) {
      setFormError(body.error === 'outstanding_schema_required' ? 'Outstanding items are not saved on this server yet.' : 'That item was not saved.');
      return false;
    }
    setFormError('');
    setOutstanding((current) => [...current, body.item]);
    if (body.sheet?.status === 'conflict') setFormError(`The Sheet cell ${body.sheet.cell || ''} changed since the last sync. It was not overwritten.`);
    return true;
  }

  async function onCompleteOutstanding(id) {
    const res = await fetch('/api/cockpit/outstanding', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      setFormError('That item was not marked done.');
      return;
    }
    setOutstanding((current) => current.filter((item) => item.id !== id));
  }

  async function onDismissAuto(task) {
    const res = await fetch('/api/cockpit/outstanding', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: task.id, source: 'auto', taskKey: task.taskKey, period: task.period }),
    });
    if (!res.ok) {
      setFormError('That task was not dismissed. The dismissal table may not be applied yet.');
      return;
    }
    setDismissals((current) => [...current, { id: task.id, taskKey: task.taskKey, period: task.period }]);
  }

  async function onRemove(id) {
    const res = await fetch('/api/cockpit/plan', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      setFormError('The plan row was not removed.');
      return;
    }
    setPlan((current) => current.filter((entry) => entry.id !== id));
  }

  const items = visibleNav(areas);

  async function onSignOut() {
    await fetch('/api/cockpit/login', { method: 'DELETE' });
    window.location.href = '/cockpit/login';
  }

  function setThemeMode(next) {
    const saved = writeTheme(window.localStorage, next);
    setTheme(saved);
    window.dispatchEvent(new Event('jrl-theme'));
  }

  const who = role === 'admin' ? 'Jack' : (client || role);
  const hello = greeting();
  const subtitle = area === 'jrl'
    ? 'Personal pots and the ledger. A gap stays a gap.'
    : area === 'automations'
      ? 'What has run, and what has not posted yet.'
      : tokiView === 'sources'
        ? 'Retainers on the left, projects on the right.'
        : 'Stay on top of the month, the year, and what is still missing.';

  return (
    <div className="jrl-root" data-theme={theme === 'dark' ? 'dark' : 'light'}>
      <div className="fx-shell">
        <aside className="side" data-collapsed={collapsed ? 'true' : 'false'} aria-label="Cockpit sections">
          <div className="rail-group rail-theme">
            <button type="button" className={theme === 'light' ? 'on' : undefined} aria-label="Light" aria-pressed={theme === 'light'} onClick={() => setThemeMode('light')}><SunIcon /></button>
            <button type="button" className={theme === 'dark' ? 'on' : undefined} aria-label="Dark" aria-pressed={theme === 'dark'} onClick={() => setThemeMode('dark')}><MoonIcon /></button>
          </div>
          <nav id="cockpit-nav" className="rail-group">
            <button type="button" className={area === 'overview' ? 'rail-apps on' : 'rail-apps'} aria-label="Overview" aria-pressed={area === 'overview'} onClick={() => setArea('overview')}><GridIcon /></button>
            {items.map((item) => (
              <Fragment key={item.id}>
                <a
                  href={`#${item.id}`}
                  className={area === item.id ? 'on' : undefined}
                  aria-label={item.label}
                  aria-current={item.id === 'toki' ? (area === 'toki' && tokiView === 'toki' ? 'page' : undefined) : (area === item.id ? 'page' : undefined)}
                  onClick={(event) => { event.preventDefault(); setArea(item.id); if (item.id === 'toki') setTokiView('toki'); }}
                >
                  <span className="ic"><NavMark id={item.id} /></span>
                  <span className="lbl">{item.label}</span>
                  <span className="nav-tip">{item.label}</span>
                </a>
              </Fragment>
            ))}
          </nav>
          <div className="rail-group rail-foot">
            <button type="button" aria-label={collapsed ? 'Expand menu' : 'Collapse menu'} title={`Press [ to collapse the menu (${NAV_STORAGE_KEY}).`} onClick={onToggleNav}><HelpIcon /></button>
            <button type="button" aria-label="Sign out" onClick={onSignOut}><LogoutIcon /></button>
          </div>
        </aside>
        <div className="fx-canvas">
          <header className="fx-top">
            <div className="fx-brand">
              <span className="fx-logo" aria-hidden="true"><NavMark id="toki" /></span>
              <span>Toki</span>
            </div>
            <div className="fx-tabs" role="tablist" aria-label="Cockpit">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={area === item.id && (item.id !== 'toki' || tokiView === 'toki')}
                  onClick={() => { setArea(item.id); if (item.id === 'toki') setTokiView('toki'); }}
                >
                  {item.label}
                </button>
              ))}
              {areas.includes('toki') && TOKI_VIEWS.map((view) => (
                <button key={view.id} type="button" role="tab" aria-label={view.label} aria-selected={area === 'toki' && tokiView === view.id} onClick={() => { setArea('toki'); setTokiView(view.id); }}>{view.label}</button>
              ))}
              {areas.includes('toki') && (
                <button type="button" role="tab" aria-selected={area === 'forecast'} onClick={() => setArea('forecast')}>Forecast</button>
              )}
            </div>
            <details className="fx-user">
              <summary>
                <span className="fx-avatar" aria-hidden="true">{String(who).slice(0, 1)}</span>
                <span className="fx-user-text">
                  <b>{who}</b>
                  <span>{client || role}</span>
                </span>
                <ChevronIcon />
              </summary>
              <div className="fx-menu">
                <button type="button" onClick={() => setThemeMode('light')}>Light</button>
                <button type="button" onClick={() => setThemeMode('dark')}>Dark</button>
                <button type="button" onClick={onSignOut}>Sign out</button>
              </div>
            </details>
          </header>
          <div className="fx-greet">
            <h1>{hello}, {who}</h1>
            <p>{subtitle}</p>
          </div>
          <main className="main">
            {area === 'overview' && <OverviewScreen forecast={storedForecast} plan={plan} actuals={actuals} details={details} jrl={jrl} jrlLoading={jrlLoading} runs={runBoard} runsLoading={runsLoading} outstanding={outstanding} auto={deriveAutoTasks({ period: currentTokiMonth(), cells: forecastCellsFromRows(storedForecast?.rows), details, entries: jrlLoading ? null : (jrl?.body?.entries || []), posts: runsLoading ? null : (runBoard?.posts ?? null), dismissals })} onOpen={openSpace} />}
            {area === 'forecast' && <ForecastScreen />}
            {area === 'toki' && <TokiScreen baseline={baseline} actuals={actuals} evidence={evidence} plan={plan} planNote={planNote} onSave={onSave} onRemove={onRemove} formError={formError} forecastError={forecastError} section={tokiView} onSection={setTokiView} details={details} detailStored={detailStored} onSaveDetail={onSaveDetail} onRemoveDetail={onRemoveDetail} outstanding={outstanding} outstandingStored={outstandingStored} onAddOutstanding={onAddOutstanding} onCompleteOutstanding={onCompleteOutstanding} jrlEntries={jrl?.body?.entries || []} automationPosts={runBoard?.posts ?? null} dismissals={dismissals} onDismissAuto={onDismissAuto} focus={focus} onFocusApplied={() => setFocus(null)} />}
            {area === 'automations' && (
              <>
                <AutomationsScreen board={runBoard} error={runError} focus={focus} onFocusApplied={() => setFocus(null)} />
                {status?.coverage && <p className="caveat">The ingest alias was not called. The last export snapshot recorded {status.coverage.clientOnWithIngest} of {status.coverage.clientOn} client workflows on, and {status.coverage.jackOwnOnWithIngest} of {status.coverage.jackOwnOn} on Jack’s own account. Louise was {status.coverage.louise}.</p>}
              </>
            )}
            {area === 'jrl' && <JrlScreen gate={jrl} />}
          </main>
        </div>
      </div>
    </div>
  );
}

function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function Stroke({ children }) {
  return (
    <svg className="fx-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function SunIcon() {
  return <Stroke><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></Stroke>;
}

function MoonIcon() {
  return <Stroke><path d="M20 14.5A7.5 7.5 0 0 1 9.5 4 6.5 6.5 0 1 0 20 14.5z" /></Stroke>;
}

function HelpIcon() {
  return <Stroke><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.2 2.4c-.7.3-1.2.8-1.2 1.6V14" /><path d="M12 17h.01" /></Stroke>;
}

function LogoutIcon() {
  return <Stroke><path d="M10 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2" /><path d="M15 12H3m0 0 3-3M3 12l3 3" /></Stroke>;
}

function ChevronIcon() {
  return <Stroke><path d="M7 10l5 5 5-5" /></Stroke>;
}

function GridIcon() {
  return <Stroke><rect x="4" y="4" width="6" height="6" rx="1.2" /><rect x="14" y="4" width="6" height="6" rx="1.2" /><rect x="4" y="14" width="6" height="6" rx="1.2" /><rect x="14" y="14" width="6" height="6" rx="1.2" /></Stroke>;
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
