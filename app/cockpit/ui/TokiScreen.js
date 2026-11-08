'use client';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatPounds } from '../../../lib/money';
import { automationBoard } from '../../../lib/finance/screen';
import { workingMonthLines, sumLines, incomeBreakdown } from '../../../lib/planning/entries';
import { syntheticWorkflows, syntheticEvents, SYNTHETIC_BANNER } from '../../../lib/fixtures/synthetic';
import { TOKI_VIEWS } from '../../../lib/nav/sidebar';
import { HorizontalBars, YearColumns } from './charts';

const MONTHS = [
  ['01', 'Jan', 'January'], ['02', 'Feb', 'February'], ['03', 'Mar', 'March'], ['04', 'Apr', 'April'],
  ['05', 'May', 'May'], ['06', 'Jun', 'June'], ['07', 'Jul', 'July'], ['08', 'Aug', 'August'],
  ['09', 'Sep', 'September'], ['10', 'Oct', 'October'], ['11', 'Nov', 'November'], ['12', 'Dec', 'December'],
];
const INCOME_SPLIT = [
  ['retainer', 'Retainer', 'var(--series-retainer)'],
  ['project', 'Project', 'var(--series-project)'],
  ['unallocated', 'Not set', 'var(--series-open)'],
];
const COST_GROUPS = [
  ['administration', 'Administration and software'],
  ['people', 'People, payroll and pensions'],
  ['premises', 'Premises and studio rent'],
  ['finance', 'Finance charges and fees'],
  ['selling', 'Selling, travel and entertainment'],
];

function showMoney(minor) {
  if (minor == null || !Number.isFinite(minor)) return 'Missing information';
  return formatPounds(minor);
}

export function TokiScreen({ example, baseline, actuals, evidence, plan, planNote, onSave, onRemove, formError, forecastError, section = 'toki', onSection }) {
  const [month, setMonth] = useState('2026-01');
  const [board, setBoard] = useState('year');
  const [editAll, setEditAll] = useState(false);
  const [editingKey, setEditingKey] = useState('');
  const [drafts, setDrafts] = useState({});
  const [adding, setAdding] = useState(null);
  const [sheetError, setSheetError] = useState('');
  const monthStripRef = useRef(null);

  const page = section === 'sources' || section === 'plan' ? 'sources' : 'toki';

  useLayoutEffect(() => {
    const strip = monthStripRef.current;
    if (!strip) return undefined;
    const scrollSelected = () => {
      const selected = strip.querySelector('[aria-pressed="true"]');
      if (!selected) return;
      const left = selected.offsetLeft - (strip.clientWidth - selected.offsetWidth) / 2;
      strip.scrollTo({ left: Math.max(0, left) });
    };
    scrollSelected();
    const observer = new ResizeObserver(scrollSelected);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [month, page]);
  const year = month.slice(0, 4);
  const lines = useMemo(() => (baseline ? workingMonthLines(baseline.rows, plan, month) : []), [baseline, plan, month]);
  const billingShown = sumLines(lines, 'sale');
  const costShown = sumLines(lines, 'cost');
  const years = useMemo(() => {
    const found = new Set((baseline?.months || []).map((item) => item.key.slice(0, 4)));
    found.add(year);
    return [...found].sort();
  }, [baseline, year]);
  const yearPoints = useMemo(() => MONTHS.map(([id, label]) => ({ id: `${year}-${id}`, label })), [year]);
  const monthLines = (key) => workingMonthLines(baseline?.rows || [], plan, key);
  const chartSeries = useMemo(() => {
    if (!baseline) return null;
    const actualOf = (key) => {
      const coverage = actuals?.months?.[key]?.coverage;
      const known = actuals?.months?.[key]?.billing != null;
      return { value: known ? actuals.months[key].billing : null, status: coverage === 'partial' ? 'Partial accounting export. Not a complete profit and loss.' : known ? 'Historical accounting export.' : 'Missing information' };
    };
    const monthView = incomeBreakdown(lines);
    return {
      year: yearPoints.map((point) => {
        const split = incomeBreakdown(monthLines(point.id));
        return {
          ...point,
          total: split.total,
          actual: actualOf(point.id).value,
          lines: split.lines,
          segments: INCOME_SPLIT.map(([id, label, color]) => ({ id, label, color, value: split[id] })),
        };
      }),
      compare: {
        points: [{
          id: 'sale',
          label: 'Income',
          lines: monthView.lines,
          segments: INCOME_SPLIT.map(([id, label, color]) => ({ id, label, color, value: monthView[id] })),
        }, { id: 'cost', label: 'Costs' }],
        series: [
          { id: 'plan', label: 'Plan', color: 'var(--series-cost)', values: [{ id: 'sale', value: billingShown, status: 'Working forecast' }, { id: 'cost', value: costShown, status: 'Working forecast' }] },
          { id: 'actual', label: 'Actual', color: 'var(--series-actual)', values: [
            { id: 'sale', value: actualOf(month).value, status: actualOf(month).status },
            { id: 'cost', value: null, status: 'Missing information unless every cost actual is on record' },
          ] },
        ],
      },
      groups: {
        points: COST_GROUPS.map(([id, label]) => ({ id, label })),
        series: [{
          id: 'plan',
          label: 'Plan',
          color: 'var(--series-cost)',
          values: COST_GROUPS.map(([id]) => {
            const groupLines = lines.filter((line) => line.kind === 'cost' && line.groupId === id);
            const seen = groupLines.some((line) => line.minor != null);
            return { id, value: seen ? groupLines.reduce((sum, line) => sum + (line.minor || 0), 0) : null, status: seen ? 'Working forecast' : 'Missing information' };
          }),
        }],
      },
    };
  }, [baseline, actuals, plan, month, yearPoints, lines, billingShown, costShown]);

  if (!baseline) {
    return (
      <section>
        <div className="panel glass">
          <h2>{forecastError ? 'The stored forecast could not be read' : 'No forecast is stored yet'}</h2>
          <p style={muted}>{forecastError ? 'The workbook is not used as a fallback.' : 'The workbook is not read while the app is running. Stored cells are the forecast. Example data stays off until you ask for it.'}</p>
        </div>
      </section>
    );
  }

  const monthName = MONTHS.find((item) => item[0] === month.slice(5))?.[2] || month;
  const coverage = actuals?.months?.[month]?.coverage;
  const income = lines.filter((line) => line.kind === 'sale');
  const costs = lines.filter((line) => line.kind === 'cost');

  function chooseYear(nextYear) {
    setMonth(`${nextYear}-${month.slice(5)}`);
  }

  function draftFor(line) {
    return drafts[line.key] || {
      amount: line.minor == null ? '' : String(line.minor / 100),
      party: line.party,
      workType: line.workType || '',
      groupId: line.groupKnown ? line.groupId : '',
    };
  }

  function openEdit(line) {
    setDrafts((current) => ({ ...current, [line.key]: draftFor(line) }));
    setEditingKey(line.key);
  }

  async function saveLine(line) {
    const draft = draftFor(line);
    const groupId = line.kind === 'sale' ? 'billing' : draft.groupId;
    if (!groupId) return false;
    if (line.kind === 'sale' && line.added && draft.workType !== 'retainer' && draft.workType !== 'project') return false;
    const ok = await onSave({
      id: line.planId || undefined,
      matchId: line.matchId,
      kind: line.kind,
      amount: draft.amount,
      party: draft.party,
      groupId,
      workType: line.kind === 'sale' ? (draft.workType || null) : null,
      month,
      timing: 'one_off',
    });
    if (ok) {
      setDrafts((current) => { const next = { ...current }; delete next[line.key]; return next; });
      setEditingKey('');
    }
    return ok;
  }

  function isChanged(line) {
    const draft = drafts[line.key];
    if (!draft) return false;
    const amount = line.minor == null ? '' : String(line.minor / 100);
    const groupId = line.groupKnown ? line.groupId : '';
    return draft.amount !== amount || draft.party !== line.party || (draft.workType || '') !== (line.workType || '') || (draft.groupId || '') !== groupId;
  }

  async function saveAll() {
    const dirty = lines.filter(isChanged);
    for (const line of dirty) {
      const draft = draftFor(line);
      if (line.kind === 'cost' && !draft.groupId) {
        setSheetError('Choose a cost group before saving.');
        return;
      }
      const ok = await saveLine(line);
      if (!ok) {
        setSheetError('That line was not saved.');
        return;
      }
    }
    setSheetError('');
    setEditAll(false);
    setEditingKey('');
  }

  function rowOpen(line) {
    return editAll || editingKey === line.key;
  }

  return (
    <section className={page === 'toki' ? 'toki-view toki-dash' : 'toki-view'} aria-label={page === 'sources' ? 'Income and costs' : 'Toki'}>
      <div className="toki-sticky">
        <div className="toki-section-switch" role="navigation" aria-label="Toki sections">
          <button type="button" aria-current={page === 'toki' ? 'page' : undefined} onClick={() => onSection?.('toki')}>Toki</button>
          {TOKI_VIEWS.map((item) => (
            <button key={item.id} type="button" aria-current={page === 'sources' ? 'page' : undefined} onClick={() => onSection?.(item.id)}>{item.label}</button>
          ))}
        </div>
        <div className="toki-period">
          <label className="year-select">Year
            <select aria-label="Year" value={year} onChange={(event) => chooseYear(event.target.value)}>
              {years.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <div className="toki-months" role="group" aria-label="Month" ref={monthStripRef}>
            {MONTHS.map(([id, short, long]) => {
              const key = `${year}-${id}`;
              const itemCoverage = actuals?.months?.[key]?.coverage;
              const mark = itemCoverage === 'partial' ? 'partial' : itemCoverage === 'missing' ? 'missing' : '';
              const detail = mark === 'partial' ? ', partial accounting export' : mark === 'missing' ? ', accounting actuals missing' : '';
              return (
                <button key={key} type="button" aria-pressed={month === key} aria-label={`${long} ${year}${detail}`} onClick={() => setMonth(key)}>
                  {short}
                  {mark ? <i className={`month-dot ${mark}`} aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        </div>
        <p id="toki-month-detail" className="toki-month-title" aria-live="polite">{monthName} {year}</p>
        <div className="toki-alerts">
          {coverage === 'partial' && <p className="alert-pill" role="status">Partial accounting export. Not a complete profit and loss.</p>}
          {coverage === 'missing' && <p className="alert-pill" role="status">Accounting actuals are missing information, not zero.</p>}
          {(baseline.formulaFlags || []).map((flag) => (
            <p key={flag.month} className="alert-pill" role="status">January 2027 source total omits {formatPounds(flag.omittedMinor)}. The stored cell is not replaced.</p>
          ))}
        </div>
      </div>
      {baseline.synthetic && <p className="caveat">{SYNTHETIC_BANNER}</p>}

      {page === 'toki' && chartSeries && (
        <>
          <div className="toki-panel-tabs" role="tablist" aria-label="Toki charts">
            {[['month', 'This month'], ['year', 'Year'], ['groups', 'Groups']].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={board === id} onClick={() => setBoard(id)}>{label}</button>
            ))}
          </div>
          <div className="stats" data-panel="month" data-on={board === 'month' ? 'true' : 'false'}>
            <Tile label="Income" value={showMoney(billingShown)} />
            <Tile label="Costs" value={showMoney(costShown)} />
            <Tile label="Result" value={showMoney(billingShown == null || costShown == null ? null : billingShown - costShown)} />
          </div>
          <div className="chart-panel" data-panel="month" data-on={board === 'month' ? 'true' : 'false'}>
            <p className="phone-result">Result {showMoney(billingShown == null || costShown == null ? null : billingShown - costShown)}</p>
            <HorizontalBars name="Income and costs" points={chartSeries.compare.points} series={chartSeries.compare.series} format={formatPounds} />
          </div>
          <div className="chart-panel" data-panel="year" data-on={board === 'year' ? 'true' : 'false'}>
            <YearColumns name="Income through the year" months={chartSeries.year} selectedId={month} onOpen={(key) => { setMonth(key); onSection?.('sources'); }} format={formatPounds} />
          </div>
          <div className="chart-panel" data-panel="groups" data-on={board === 'groups' ? 'true' : 'false'}>
            <HorizontalBars name="Cost groups" points={chartSeries.groups.points} series={chartSeries.groups.series} format={formatPounds} />
          </div>
          <p className="quiet quiet-full">{baseline.grossProfitMeaning} A gap on a chart is missing information, not zero.</p>
          <p className="quiet quiet-short">Not profit after costs. A gap means missing, not zero.</p>
        </>
      )}

      {page === 'sources' && (
        <div className="month-sheet">
          <div className="sheet-tools">
            <button type="button" onClick={() => { if (editAll) { setEditAll(false); setEditingKey(''); setDrafts({}); } else { const next = {}; lines.forEach((line) => { next[line.key] = draftFor(line); }); setDrafts(next); setEditAll(true); } }}>{editAll ? 'Cancel all' : 'Edit all'}</button>
            {editAll && <button type="button" onClick={saveAll}>Save all</button>}
          </div>
          {(sheetError || formError) && <p role="alert">{sheetError || formError}</p>}
          {planNote && <p className="quiet">{planNote} These edits are a working forecast.</p>}
          <SheetBlock title="Income" lines={income} bulk={editAll} rowOpen={rowOpen} draftFor={draftFor} setDrafts={setDrafts} openEdit={openEdit} saveLine={saveLine} onRemove={onRemove} setEditingKey={setEditingKey} />
          <div className="sheet-add">
            <button type="button" onClick={() => setAdding({ kind: 'sale', workType: 'retainer', party: '', amount: '', groupId: 'billing' })}>Add a retainer</button>
            <button type="button" onClick={() => setAdding({ kind: 'sale', workType: 'project', party: '', amount: '', groupId: 'billing' })}>Add project work</button>
          </div>
          <SheetBlock title="Costs" lines={costs} bulk={editAll} rowOpen={rowOpen} draftFor={draftFor} setDrafts={setDrafts} openEdit={openEdit} saveLine={saveLine} onRemove={onRemove} setEditingKey={setEditingKey} />
          <div className="sheet-add">
            <button type="button" onClick={() => setAdding({ kind: 'cost', workType: '', party: '', amount: '', groupId: '' })}>Add a cost</button>
          </div>
          {adding && (
            <form className="sheet-new" onSubmit={async (event) => {
              event.preventDefault();
              const ok = await onSave({ kind: adding.kind, amount: adding.amount, party: adding.party, groupId: adding.kind === 'sale' ? 'billing' : adding.groupId, workType: adding.workType, month, timing: 'one_off' });
              if (ok) setAdding(null);
            }}>
              <input aria-label="Name or client" placeholder="Name or client" value={adding.party} onChange={(event) => setAdding({ ...adding, party: event.target.value })} />
              <input aria-label="Amount in pounds" placeholder="Amount" value={adding.amount} onChange={(event) => setAdding({ ...adding, amount: event.target.value })} />
              {adding.kind === 'cost' && (
                <select aria-label="Cost group" value={adding.groupId} onChange={(event) => setAdding({ ...adding, groupId: event.target.value })}>
                  <option value="">Choose a group</option>
                  {COST_GROUPS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              )}
              <button type="submit">Save line</button>
              <button type="button" onClick={() => setAdding(null)}>Cancel</button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}

function SheetBlock({ title, lines, bulk, rowOpen, draftFor, setDrafts, openEdit, saveLine, onRemove, setEditingKey }) {
  return (
    <section className="sheet-block">
      <h2>{title}</h2>
      <ul className="sheet-rows">
        {lines.map((line) => {
          const open = rowOpen(line);
          const draft = draftFor(line);
          return (
            <li key={line.key}>
              {open ? <input aria-label={`${title} name`} value={draft.party} onChange={(event) => setDrafts((current) => ({ ...current, [line.key]: { ...draft, party: event.target.value } }))} /> : <span>{line.party}</span>}
              {line.kind === 'sale' ? (
                open ? (
                  <select aria-label="Income type" value={draft.workType} onChange={(event) => setDrafts((current) => ({ ...current, [line.key]: { ...draft, workType: event.target.value } }))}>
                    <option value="">Not set</option>
                    <option value="retainer">Retainer</option>
                    <option value="project">Project</option>
                  </select>
                ) : <span>{line.workType === 'retainer' ? 'Retainer' : line.workType === 'project' ? 'Project' : 'Not set'}</span>
              ) : (
                open ? (
                  <select aria-label="Cost group" value={draft.groupId} onChange={(event) => setDrafts((current) => ({ ...current, [line.key]: { ...draft, groupId: event.target.value } }))}>
                    <option value="">Not set</option>
                    {COST_GROUPS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                ) : <span>{line.groupKnown ? (COST_GROUPS.find(([id]) => id === line.groupId)?.[1] || line.groupId) : 'Not set'}</span>
              )}
              {open ? <input aria-label="Amount in pounds" value={draft.amount} onChange={(event) => setDrafts((current) => ({ ...current, [line.key]: { ...draft, amount: event.target.value } }))} /> : <span className="num">{showMoney(line.minor)}</span>}
              {open ? <button type="button" onClick={() => saveLine(line)}>Save</button> : <button type="button" onClick={() => openEdit(line)}>Edit</button>}
              {open && !bulk && <button type="button" onClick={() => { setEditingKey(''); setDrafts((current) => { const next = { ...current }; delete next[line.key]; return next; }); }}>Cancel</button>}
              {line.planId && onRemove ? <button type="button" onClick={() => onRemove(line.planId)}>Remove</button> : null}
              {line.overridden && line.baseMinor != null ? <span className="quiet">Was {showMoney(line.baseMinor)}</span> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Summary({ billing, costs }) {
  return (
    <div className="stats">
      <Tile label="Billing" value={showMoney(billing)} />
      <Tile label="Costs" value={showMoney(costs)} />
      <Tile label="Result" value={showMoney(billing == null || costs == null ? null : billing - costs)} />
    </div>
  );
}

export function AutomationsScreen({ example, board, error }) {
  if (!example && board?.posts != null) {
    return (
      <section>
        <p style={muted}>Logged posts from the run log for this month. A missing or old post is not a failure. The registry export is separate.</p>
        <div className="stats">
          <Tile label="Logged posts" value={String(board.posts)} />
          <Tile label="Accounts" value={String(board.accounts)} />
          <Tile label="Zap ids that posted" value={String(board.reportingZapIds)} />
          <Tile label="Estimated value" value={`£${Number(board.estimate.value || 0).toLocaleString('en-GB')}`} />
        </div>
        <p style={muted}>{board.reportingZapIdsMeaning} Posts with no zap id: {board.postsWithoutZapId}. {board.estimate.label} Last 7 days in this set: {board.postsLast7Days}.</p>
        <div style={tableWrap}>
          <table style={table}>
            <thead><tr><th style={th}>Account</th><th style={th}>Posts</th><th style={th}>Zap ids that posted</th><th style={th}>Latest</th></tr></thead>
            <tbody>
              {board.accountRows.map((row) => (
                <tr key={row.logAccount || row.name}>
                  <td style={td}>{row.name}</td>
                  <td style={td}>{row.runs}</td>
                  <td style={td}>{row.reportingZapIds}</td>
                  <td style={td}>{row.latest ? row.latest.slice(0, 16).replace('T', ' ') : 'None'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={muted}>{board.registry.note}</p>
      </section>
    );
  }
  if (!example) {
    return (
      <section>
        <div className="panel glass">
          <h2>{error === 'run_log_not_configured' ? 'The run log is not configured on this server' : error ? 'The run log could not be read' : 'Reading the run log'}</h2>
          <p style={muted}>{error === 'run_log_not_configured' ? 'Signed-in Automations needs SUPABASE_URL and SUPABASE_SERVICE_KEY for the Toki project. No posts were marked failed.' : 'A workflow with no posts is not treated as failed. Time and money stay estimates until a post is measured.'}</p>
        </div>
      </section>
    );
  }
  const exampleBoard = automationBoard(syntheticWorkflows(), syntheticEvents());
  return (
    <section>
      <p style={exampleBanner}>{SYNTHETIC_BANNER}</p>
          <div className="stats">
            <Tile label="Checkpoints" value={String(exampleBoard.checkpoints)} />
            <Tile label="Unique runs" value={exampleBoard.uniqueRuns == null ? 'Not known' : String(exampleBoard.uniqueRuns)} />
            <Tile label="Estimated value" value={exampleBoard.savings.withheld ? 'Not calculated' : formatPounds(exampleBoard.savings.minor)} />
          </div>
      <div style={tableWrap}>
        <table style={table}>
          <thead><tr><th style={th}>Workflow</th><th style={th}>Status</th></tr></thead>
          <tbody>
            {exampleBoard.rows.map((row) => (
              <tr key={row.zapId}>
                <td style={td}>{row.title}</td>
                <td style={td}>{row.health.state === 'no_events' ? 'No events yet' : row.health.state === 'last_event_succeeded' ? 'Last event succeeded' : row.health.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={muted}>{exampleBoard.savings.label}</p>
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
    <div className="toki-table">
      <table>
        <thead><tr><th>Group</th><th>Plan</th><th>Accounting actual</th><th>Difference</th><th>Reading</th></tr></thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.groupId}>
              <td>{group.label}</td>
              <td>{showMoney(group.shownForecast ?? group.forecast.minor)}</td>
              <td>{group.actual.known ? showMoney(group.actual.minor) : group.groupId === 'people' ? 'Missing information. People actuals are not on record.' : group.actual.coverage === 'partial' ? 'Missing information. Partial export.' : 'Missing information'}</td>
              <td>{group.rawDifference == null ? 'Missing information' : formatPounds(group.rawDifference)}</td>
              <td>{group.judgement === 'unknown' ? 'Missing information' : group.judgement === 'incomplete' ? 'Incomplete' : group.direction}</td>
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
