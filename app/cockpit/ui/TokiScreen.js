'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatPounds } from '../../../lib/money';
import { workingMonthLines, sumLines, incomeBreakdown } from '../../../lib/planning/entries';
import { TOKI_VIEWS } from '../../../lib/nav/sidebar';
import { HorizontalBars, YearColumns } from './charts';
import { IncomeBoard } from './IncomeBoard';
import { DetailDrawer, DetailFields } from './DetailDrawer';
import { deriveAutoTasks } from '../../../lib/planning/autoTasks';
import { priceZaps, savingsFromZaps } from '../../../lib/automations/savings';

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
  if (minor == null || !Number.isFinite(minor)) return '—';
  return formatPounds(minor);
}

export function TokiScreen({ example, baseline, actuals, evidence, plan, planNote, onSave, onRemove, formError, forecastError, section = 'toki', onSection, details = [], detailStored = false, onSaveDetail, onRemoveDetail, outstanding = [], outstandingStored = false, onAddOutstanding, onCompleteOutstanding, jrlEntries = [], automationPosts = null, dismissals = [], potsUpdated = true, onDismissAuto, focus = null, onFocusApplied }) {
  const [month, setMonth] = useState('2026-01');
  const [board, setBoard] = useState('year');
  const [editAll, setEditAll] = useState(false);
  const [editingKey, setEditingKey] = useState('');
  const [drafts, setDrafts] = useState({});
  const [adding, setAdding] = useState(null);
  const [sheetError, setSheetError] = useState('');
  const [lineQuery, setLineQuery] = useState('');
  const [detail, setDetail] = useState(null);
  const [lineKind, setLineKind] = useState('all');
  const [quick, setQuick] = useState(null);
  const [todoTitle, setTodoTitle] = useState('');
  const monthStripRef = useRef(null);
  useEffect(() => {
    if (!focus || focus.area !== 'toki') return;
    if (focus.month) setMonth(focus.month);
    if (focus.board) setBoard(focus.board);
    if (focus.quick) { setQuick(focus.quick); setDetail(null); }
    else if (focus.detail) setDetail(focus.detail);
    onFocusApplied?.();
  }, [focus]);

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

  const autoTasks = deriveAutoTasks({
    period: month,
    cells: (baseline?.rows || []).flatMap((row) => Object.entries(row.cells || {}).map(([key, cell]) => ({
      label: row.label, kind: row.kind, rowNumber: row.rowNumber, month: key, enteredMinor: cell.blank ? null : cell.minor, amountMinor: cell.blank ? null : cell.minor, nullState: cell.blank ? 'blank' : 'amount',
    }))),
    details,
    entries: jrlEntries,
    posts: automationPosts,
    potsUpdated,
    dismissals,
  });

  if (!baseline) {
    return (
      <section>
        <div className="panel glass">
          <h2>{forecastError ? 'The stored forecast could not be read' : 'No forecast is stored yet'}</h2>
          <p style={muted}>{forecastError ? 'The workbook is not used as a fallback.' : 'No stored forecast is on this server yet. Nothing here is filled in.'}</p>
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
      {page === 'toki' && chartSeries && (
        <div className="bento">
          <div className="bento-left">
          <article className="card glass bento-summary">
            <div className="k">This month</div>
            <div className="v num">{showMoney(billingShown == null || costShown == null ? null : billingShown - costShown)}</div>
            <p className="sub">{monthName} {year}</p>
            <div className="bento-actions">
              <button type="button" className="btn" onClick={() => onSection?.('sources')}>Income</button>
              <button type="button" className="btn btn-ghost" onClick={() => setBoard('groups')}>Groups</button>
            </div>
          </article>
          <section className="card glass bento-progress">
            <div className="k">Costs against income</div>
            <p className="spend-line"><b>{showMoney(costShown)}</b> spent out of <b>{showMoney(billingShown)}</b></p>
            <div className="limit-track" aria-hidden="true"><i style={{ width: billingShown && costShown != null ? `${Math.min(100, Math.round((costShown / billingShown) * 100))}%` : '0%' }} /></div>
            <ul className="cost-split">
              {COST_GROUPS.map(([id, label]) => {
                const groupLines = lines.filter((line) => line.kind === 'cost' && line.groupId === id);
                const seen = groupLines.some((line) => line.minor != null);
                const value = seen ? groupLines.reduce((sum, line) => sum + (line.minor || 0), 0) : null;
                const width = value != null && costShown ? `${Math.min(100, Math.round((value / costShown) * 100))}%` : '0%';
                return (
                  <li key={id}>
                    <span>{label}</span>
                    <span className="cost-meter" aria-hidden="true"><i style={{ width }} /></span>
                    <b className="num">{showMoney(value)}</b>
                  </li>
                );
              })}
            </ul>
            <p className="sub">A missing side stays missing. It is not treated as zero.</p>
          </section>
          </div>
          <div className="bento-stats">
            <Tile icon="income" label="Income" value={showMoney(billingShown)} delta={monthDelta(chartSeries.year, month, 'total')} onOpen={() => setDetail({ title: 'Income', fields: [{ label: 'Month', value: `${monthName} ${year}` }, { label: 'Income', value: showMoney(billingShown) }] })} />
            <Tile icon="cost" label="Costs" value={showMoney(costShown)} delta={null} note="No prior month" onOpen={() => setDetail({ title: 'Costs', fields: [{ label: 'Month', value: `${monthName} ${year}` }, { label: 'Costs', value: showMoney(costShown) }] })} />
            <Tile icon="result" label="Result" value={showMoney(billingShown == null || costShown == null ? null : billingShown - costShown)} delta={null} note="No prior month" onOpen={() => setDetail({ title: 'Result', fields: [{ label: 'Month', value: `${monthName} ${year}` }, { label: 'Result', value: showMoney(billingShown == null || costShown == null ? null : billingShown - costShown) }] })} />
            <Tile icon="year" label="Known months" value={String(chartSeries.year.filter((item) => item.total != null).length)} delta={null} note="No prior month" onOpen={() => setDetail({ title: 'Known months', fields: [{ label: 'Year', value: year }, { label: 'Known months', value: String(chartSeries.year.filter((item) => item.total != null).length) }] })} />
          </div>
          <div className="bento-chart">
            {board === 'month' && <HorizontalBars name="This month" tabs={<ChartTabs board={board} setBoard={setBoard} />} points={chartSeries.compare.points} series={chartSeries.compare.series} format={formatPounds} onOpen={(id) => { const point = chartSeries.compare.points.find((item) => item.id === id); setDetail({ title: point?.label || 'This month', fields: (point?.lines || []).map((line) => ({ label: line.name, value: line.minor == null ? '—' : formatPounds(line.minor) })) }); }} />}
            {board === 'year' && <YearColumns name="Income" subtitle="Retainer and project income by month" tabs={<ChartTabs board={board} setBoard={setBoard} />} months={chartSeries.year} selectedId={month} onOpen={(key) => { const item = chartSeries.year.find((entry) => entry.id === key); setMonth(key); setDetail({ title: item?.label || key, fields: [{ label: 'Income', value: showMoney(item?.total) }, ...(item?.lines || []).map((line) => ({ label: line.name, value: line.minor == null ? '—' : formatPounds(line.minor) }))] }); }} format={formatPounds} />}
            {board === 'groups' && <HorizontalBars name="Cost groups" tabs={<ChartTabs board={board} setBoard={setBoard} />} points={chartSeries.groups.points} series={chartSeries.groups.series} format={formatPounds} onOpen={(id) => { const point = chartSeries.groups.points.find((item) => item.id === id); setDetail({ title: point?.label || 'Cost group', fields: [{ label: 'Amount', value: showMoney(point?.segments?.[0]?.value ?? point?.lines?.[0]?.minor) }] }); }} />}
          </div>
          <div className="quick-row">
            <button type="button" className="card glass quick-card" onClick={() => { setDetail(null); setQuick({ kind: 'additional_cost', party: '', amount: '', firstPaymentMonth: month, contractEndDate: '' }); }}>
              <QuickMark name="cost" />
              <h3>Add a cost</h3>
              <p className="sub">Saved with this month’s costs. Not added to the forecast.</p>
              <span className="btn quick-foot">Add a cost</span>
            </button>
            <button type="button" className="card glass quick-card" onClick={() => { setDetail(null); setQuick({ kind: 'project', party: '', amount: '', services: '', firstPaymentMonth: month, contractEndDate: '' }); }}>
              <QuickMark name="project" />
              <h3>Add a project</h3>
              <p className="sub">A project line in the private income store.</p>
              <span className="btn quick-foot">Add a project</span>
            </button>
            <button type="button" className="card glass quick-card" onClick={() => { setDetail(null); setQuick({ kind: 'retainer', party: '', amount: '', services: '', firstPaymentMonth: month, contractEndDate: '' }); }}>
              <QuickMark name="retainer" />
              <h3>Add a retainer</h3>
              <p className="sub">A retainer needs a contract end. It is not added to the forecast.</p>
              <span className="btn quick-foot">Add a retainer</span>
            </button>
            <article className="card glass quick-card">
              <QuickMark name="todo" />
              <h3>Outstanding</h3>
              <p className="sub">{outstandingStored ? 'Tick an item when it is done.' : 'Outstanding items are not saved on this server yet.'}</p>
              <ul className="todo-list">
                {outstanding.map((item) => (
                  <li key={item.id}>
                    <label>
                      <input type="checkbox" aria-label={`Mark done: ${item.title}`} onChange={() => onCompleteOutstanding?.(item.id)} />
                      <span>{item.title}</span>
                    </label>
                  </li>
                ))}
                {!outstanding.length && !autoTasks.length && <li className="sub">Nothing outstanding.</li>}
                {autoTasks.map((task) => (
                  <li key={task.id}>
                    <label>
                      <input type="checkbox" aria-label={`Dismiss: ${task.title}`} onChange={() => onDismissAuto?.(task)} />
                      <a href={task.href}>{task.title}</a>
                    </label>
                  </li>
                ))}
              </ul>
              <form className="quick-add quick-foot" onSubmit={(event) => { event.preventDefault(); if (!todoTitle.trim() || !outstandingStored) return; onAddOutstanding?.(todoTitle.trim()); setTodoTitle(''); }}>
                <input aria-label="New outstanding item" placeholder="Add an item" value={todoTitle} onChange={(event) => setTodoTitle(event.target.value)} />
                <button type="submit" className="btn" disabled={!outstandingStored}>Add</button>
              </form>
            </article>
          </div>
          <section className="card glass bento-table">
            <header className="table-tools">
              <h2>Forecast lines</h2>
              <input aria-label="Search lines" placeholder="Search" value={lineQuery} onChange={(event) => setLineQuery(event.target.value)} />
              <select aria-label="Filter lines" value={lineKind} onChange={(event) => setLineKind(event.target.value)}>
                <option value="all">All</option>
                <option value="sale">Income</option>
                <option value="cost">Costs</option>
              </select>
            </header>
            <div className="ledger-scroll">
              <table className="forecast-table">
                <thead><tr><th className="check"><span className="sr">Select</span></th><th>Line</th><th>Kind</th><th className="num">Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {lines.filter((line) => (lineKind === 'all' || line.kind === lineKind) && String(line.party || '').toLowerCase().includes(lineQuery.toLowerCase())).map((line) => (
                    <tr key={line.key} className="click-row" onClick={() => setDetail({ title: line.party, fields: [{ label: 'Kind', value: line.kind === 'sale' ? (line.workType || 'Income') : 'Cost' }, { label: 'Amount', value: showMoney(line.minor) }, { label: 'Month', value: month }] })}>
                      <td className="check"><input type="checkbox" aria-label={`Select ${line.party}`} onClick={(event) => event.stopPropagation()} /></td>
                      <td>{line.party}</td>
                      <td>{line.kind === 'sale' ? (line.workType === 'project' ? 'Project' : line.workType === 'retainer' ? 'Retainer' : 'Income') : 'Cost'}</td>
                      <td className="num">{showMoney(line.minor)}</td>
                      <td>{line.minor == null ? <span className="status-dot miss">No data</span> : <span className={line.kind === 'cost' ? 'status-dot warn' : 'status-dot ok'}>In forecast</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {page === 'sources' && (
        <div className="month-sheet">
          <div className="sheet-tools">
            <button type="button" onClick={() => { if (editAll) { setEditAll(false); setEditingKey(''); setDrafts({}); } else { const next = {}; lines.forEach((line) => { next[line.key] = draftFor(line); }); setDrafts(next); setEditAll(true); } }}>{editAll ? 'Cancel all' : 'Edit all'}</button>
            {editAll && <button type="button" onClick={saveAll}>Save all</button>}
          </div>
          {(sheetError || formError) && <p role="alert">{sheetError || formError}</p>}
          {planNote && <p className="quiet">{planNote} These edits are a working forecast.</p>}
          <IncomeBoard
            month={month}
            records={details}
            stored={detailStored}
            onOpen={(row) => setDetail({ title: row.party, fields: [{ label: 'Kind', value: row.kind }, { label: 'Services', value: row.services || '—' }, { label: 'Amount', value: row.amountMinor == null ? '—' : formatPounds(row.amountMinor) }, { label: 'First payment', value: row.firstPaymentMonth || '—' }, { label: 'Contract end', value: row.contractEndUnknown ? 'Unknown' : (row.contractEndDate || '—') }, { label: 'Comment', value: row.comment || 'None' }] })}
            baselineRetainer={incomeBreakdown(lines).retainer}
            baselineProject={incomeBreakdown(lines).project}
            onSave={onSaveDetail}
            onRemove={onRemoveDetail}
            costContent={(
              <>
                <SheetBlock title="Forecast costs" lines={costs} bulk={editAll} rowOpen={rowOpen} draftFor={draftFor} setDrafts={setDrafts} openEdit={openEdit} saveLine={saveLine} onRemove={onRemove} setEditingKey={setEditingKey} />
                <div className="sheet-add">
                  <button type="button" onClick={() => setAdding({ kind: 'cost', workType: '', party: '', amount: '', groupId: '' })}>Add a cost</button>
                </div>
                {adding?.kind === 'cost' && (
                  <form className="sheet-new" onSubmit={async (event) => {
                    event.preventDefault();
                    const ok = await onSave({ kind: 'cost', amount: adding.amount, party: adding.party, groupId: adding.groupId, workType: '', month, timing: 'one_off' });
                    if (ok) setAdding(null);
                  }}>
                    <input aria-label="Name or client" placeholder="Name or client" value={adding.party} onChange={(event) => setAdding({ ...adding, party: event.target.value })} />
                    <input aria-label="Amount in pounds" placeholder="Amount" value={adding.amount} onChange={(event) => setAdding({ ...adding, amount: event.target.value })} />
                    <select aria-label="Cost group" value={adding.groupId} onChange={(event) => setAdding({ ...adding, groupId: event.target.value })}>
                      <option value="">Choose a group</option>
                      {COST_GROUPS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                    </select>
                    <button type="submit">Save line</button>
                    <button type="button" onClick={() => setAdding(null)}>Cancel</button>
                  </form>
                )}
              </>
            )}
          />
        </div>
      )}
      <DetailDrawer title={detail?.title || (quick ? (quick.kind === 'additional_cost' ? 'Add a cost' : quick.kind === 'project' ? 'Add a project' : 'Add a retainer') : '')} onClose={() => { setDetail(null); setQuick(null); }}>
        {detail && !quick && <DetailFields fields={detail.fields} />}
        {quick && (
          <form className="drawer-form" onSubmit={async (event) => {
            event.preventDefault();
            if (!detailStored) return;
            const ok = await onSaveDetail?.({ ...quick, observedMonth: quick.kind === 'additional_cost' ? month : quick.firstPaymentMonth });
            if (ok) setQuick(null);
          }}>
            {!detailStored && <p className="sub">Client lines are not saved on this server yet. The forecast is unchanged.</p>}
            <label>Name<input aria-label="Name or client" value={quick.party} onChange={(event) => setQuick({ ...quick, party: event.target.value })} /></label>
            <label>Amount<input aria-label="Amount in pounds" inputMode="decimal" value={quick.amount} onChange={(event) => setQuick({ ...quick, amount: event.target.value })} /></label>
            {quick.kind !== 'additional_cost' && (
              <>
                <label>Services<input aria-label="Services" value={quick.services || ''} onChange={(event) => setQuick({ ...quick, services: event.target.value })} /></label>
                <label>First payment<input aria-label="First payment month" type="month" value={quick.firstPaymentMonth || ''} onChange={(event) => setQuick({ ...quick, firstPaymentMonth: event.target.value })} /></label>
                <label>Contract end<input aria-label="Contract end date" type="date" value={quick.contractEndDate || ''} onChange={(event) => setQuick({ ...quick, contractEndDate: event.target.value })} /></label>
              </>
            )}
            {formError && <p role="alert">{formError}</p>}
            <button type="submit" className="btn" disabled={!detailStored}>Save</button>
          </form>
        )}
      </DetailDrawer>
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

function runFields(row) {
  return [
    { label: 'Account', value: row.name },
    { label: 'Log label', value: row.logAccount || '—' },
    { label: 'Ingest slug', value: row.ingestSlug || 'Not linked' },
    { label: 'Posts', value: String(row.runs) },
    { label: 'Zap ids that posted', value: String(row.reportingZapIds) },
    { label: 'Posts without a zap id', value: String(row.postsWithoutZapId) },
    { label: 'Latest', value: row.latest ? row.latest.slice(0, 16).replace('T', ' ') : 'None' },
  ];
}

export function AutomationsScreen({ board, error, focus = null, onFocusApplied }) {
  const [view, setView] = useState('cards');
  const [detail, setDetail] = useState(null);
  const [settings, setSettings] = useState(false);
  const [rates, setRates] = useState([]);
  const [rateForm, setRateForm] = useState({ client: '', hourly: '50', zap: '', minutes: '7' });
  const [clients, setClients] = useState(null);
  useEffect(() => {
    let cancel = false;
    fetch('/api/dashboard?period=this-month').then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!cancel) setClients(Array.isArray(body.clients) ? body.clients : []);
    }).catch(() => { if (!cancel) setClients([]); });
    fetch('/api/cockpit/rates').then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!cancel && Array.isArray(body.rows)) setRates(body.rows);
    }).catch(() => {});
    return () => { cancel = true; };
  }, []);
  useEffect(() => {
    if (!focus || focus.area !== 'automations') return;
    if (focus.detail) setDetail(focus.detail);
    onFocusApplied?.();
  }, [focus]);
  const rows = board?.accountRows || [];
  const zaps = board?.zapRows || [];
  const ready = board?.posts != null;
  const pricedZaps = priceZaps(zaps, rates);
  const totals = savingsFromZaps(zaps, rates);
  const priced = [...pricedZaps.reduce((accounts, zap) => {
    const current = accounts.get(zap.account) || { name: zap.account, runs: 0, pounds: 0, hours: 0 };
    current.runs += zap.runs;
    current.pounds += zap.pounds;
    current.hours += zap.hours;
    current.formula = `${current.runs} runs across Zaps · £${current.pounds}`;
    accounts.set(zap.account, current);
    return accounts;
  }, new Map()).values()];
  const totalPounds = totals.pounds;
  const totalHours = totals.hours;
  const max = Math.max(1, ...priced.map((row) => row.pounds || 0));
  return (
    <section className="bento">
      <div className="card glass bento-span auto-head">
        <div>
          <h2>Automations</h2>
          <p className="sub">{ready ? 'Posts, time saved, and money saved this month.' : 'No runs in this month.'}</p>
        </div>
        <div className="auto-tools">
          <div className="auto-switch" role="tablist" aria-label="Automations view">
            {[['cards', 'Cards'], ['table', 'Table'], ['graph', 'Graph']].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>
            ))}
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => setSettings(true)}>Rates</button>
        </div>
      </div>
      <div className="kpi-row">
        <Tile icon="posts" label="Posts this month" value={ready ? String(board.posts) : '—'} note="This month" />
        <Tile icon="zap" label="Active Zaps" value={ready ? String(zaps.length || board.reportingZapIds || 0) : '—'} note="This month" />
        <Tile icon="cost" label="Failures" value="—" note="This month" />
        <Tile icon="year" label="Time saved" value={ready ? `${totalHours.toFixed(1)} h` : '—'} note="This month" />
        <Tile icon="value" label="£ saved" value={ready ? `£${totalPounds.toLocaleString('en-GB')}` : '—'} note="This month" onOpen={() => setDetail({ title: '£ saved', fields: pricedZaps.map((zap) => ({ label: zap.title, value: `£${zap.pounds} · ${zap.formula}` })) })} />
      </div>
      {view === 'cards' && (
        <div className="auto-cards bento-span">
          {rows.map((row) => (
            <button key={row.logAccount || row.name} type="button" className="card glass auto-card" onClick={() => setDetail({ title: row.name, fields: runFields(row) })}>
              {runFields(row).map((field) => <p key={field.label} className="sub"><b style={{ color: 'inherit' }}>{field.label}.</b> {field.value}</p>)}
            </button>
          ))}
          {!rows.length && <article className="card glass"><p className="sub">No accounts posted this month.</p></article>}
        </div>
      )}
      {view === 'table' && (
        <div className="card glass bento-table ledger-scroll">
          <table>
            <thead>
              <tr>
                <th style={th}>Account</th>
                <th style={th}>Log label</th>
                <th style={th}>Ingest slug</th>
                <th style={th}>Posts</th>
                <th style={th}>Zap ids that posted</th>
                <th style={th}>Posts without a zap id</th>
                <th style={th}>Latest</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.logAccount || row.name} className="click-row" onClick={() => setDetail({ title: row.name, fields: runFields(row) })}>
                  {runFields(row).map((field) => <td key={field.label} style={td}>{field.value}</td>)}
                </tr>
              ))}
              {!rows.length && <tr><td style={td} colSpan="7">No accounts posted this month.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {view === 'graph' && (
        <div className="card glass bento-span">
          <h2>£ saved by account</h2>
          <div className="run-bars">
            {priced.map((row) => (
              <button key={row.logAccount || row.name} type="button" className="run-bar" title={row.formula} onClick={() => setDetail({ title: row.name, fields: [{ label: 'Posts', value: String(row.runs) }, { label: '£ saved', value: `£${row.pounds}` }, { label: 'Formula', value: row.formula }] })}>
                <span>{row.name}</span>
                <i style={{ width: `${Math.max(4, Math.round((row.pounds / max) * 100))}%` }} />
                <b>£{row.pounds}</b>
              </button>
            ))}
            {!priced.length && <p className="sub">No posts to chart this month.</p>}
          </div>
        </div>
      )}
      <section className="card glass bento-span">
        <h2>Client report</h2>
        <p className="sub">Runs and outcomes for this month.</p>
        <div className="ledger-scroll">
          <table className="forecast-table client-report">
            <thead><tr><th>Client</th><th className="num">Runs</th><th className="num">Emails</th><th className="num">Quotes</th><th className="num">Invoices</th><th className="num">Leads</th></tr></thead>
            <tbody>
              {(clients || []).map((client) => (
                <tr key={client.client} className="click-row" onClick={() => setDetail({ title: client.client, fields: [{ label: 'Runs', value: String(client.runs ?? 0) }, { label: 'Emails', value: String(client.emailsSent ?? 0) }, { label: 'Quotes', value: String(client.quotesSent ?? 0) }, { label: 'Invoices', value: String(client.invoicesSent ?? 0) }, { label: 'Leads', value: String(client.leads ?? 0) }, { label: 'Most-run', value: client.mostRunAutomation?.title || 'None' }] })}>
                  <td>{client.client}</td>
                  <td className="num">{client.runs ?? 0}</td>
                  <td className="num">{client.emailsSent ?? 0}</td>
                  <td className="num">{client.quotesSent ?? 0}</td>
                  <td className="num">{client.invoicesSent ?? 0}</td>
                  <td className="num">{client.leads ?? 0}</td>
                </tr>
              ))}
              {clients && !clients.length && <tr><td colSpan="6">No client posts this month.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <DetailDrawer title={settings ? 'Rates' : (detail?.title || '')} onClose={() => { setSettings(false); setDetail(null); }}>
        {settings ? (
          <form className="drawer-form" onSubmit={async (event) => {
            event.preventDefault();
            if (rateForm.client) {
              await fetch('/api/cockpit/rates', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'client', id: rateForm.client, hourlyRate: rateForm.hourly }) });
            }
            if (rateForm.zap) {
              await fetch('/api/cockpit/rates', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'zap', id: rateForm.zap, minutes: rateForm.minutes }) });
            }
            const again = await fetch('/api/cockpit/rates');
            const body = await again.json().catch(() => ({}));
            if (Array.isArray(body.rows)) setRates(body.rows);
          }}>
            <p className="sub">Hourly rate defaults to £50. Minutes default from the Zap title, or 7 minutes a run.</p>
            <label>Client<input aria-label="Client name" value={rateForm.client} onChange={(event) => setRateForm({ ...rateForm, client: event.target.value })} /></label>
            <label>Hourly rate<input aria-label="Hourly rate" inputMode="decimal" value={rateForm.hourly} onChange={(event) => setRateForm({ ...rateForm, hourly: event.target.value })} /></label>
            <label>Zap id<input aria-label="Zap id" value={rateForm.zap} onChange={(event) => setRateForm({ ...rateForm, zap: event.target.value })} /></label>
            <label>Minutes a run<input aria-label="Minutes a run" inputMode="numeric" value={rateForm.minutes} onChange={(event) => setRateForm({ ...rateForm, minutes: event.target.value })} /></label>
            <button type="submit" className="btn">Save rates</button>
            <ul className="todo-list">{rates.map((row) => <li key={row.id}>{row.id} {row.hourlyRateMinor ? `£${row.hourlyRateMinor / 100}/hour` : `${row.minutesPerRun} min`}</li>)}</ul>
          </form>
        ) : (detail && <DetailFields fields={detail.fields} />)}
      </DetailDrawer>
    </section>
  );
}

function ChartTabs({ board, setBoard }) {
  return (
    <div className="chart-segments" role="tablist" aria-label="Toki charts" onKeyDown={(event) => {
      const order = ['month', 'year', 'groups'];
      const index = order.indexOf(board);
      if (event.key === 'ArrowRight') setBoard(order[(index + 1) % order.length]);
      if (event.key === 'ArrowLeft') setBoard(order[(index + order.length - 1) % order.length]);
    }}>
      {[['month', 'This month'], ['year', 'Year'], ['groups', 'Groups']].map(([id, label]) => (
        <button key={id} type="button" role="tab" aria-selected={board === id} onClick={() => setBoard(id)}>{label}</button>
      ))}
    </div>
  );
}

function QuickMark({ name }) {
  const paths = {
    cost: 'M12 5v14M5 12h14',
    project: 'M4 7h16v12H4zM4 11h16',
    retainer: 'M7 7h10v4H7zM6 11h12v6H6z',
    todo: 'M5 7h14M5 12h14M5 17h9',
  };
  return (
    <span className="quick-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d={paths[name] || paths.cost} />
      </svg>
    </span>
  );
}

function StatIcon({ name }) {
  const paths = {
    income: 'M4 17l6-6 4 4 6-8M14 7h6v6',
    cost: 'M5 7h14M7 7l1 12h8l1-12M9 7V5h6v2',
    result: 'M12 3v18M7 8l5-5 5 5',
    year: 'M5 5h14v14H5zM5 9h14M9 5v4',
    posts: 'M6 7h12v10H6zM8 11h8M8 14h5',
    accounts: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 19c0-2.5 1.8-4 4-4s4 1.5 4 4',
    zap: 'M13 3L5 14h7l-1 7 8-11h-7l1-7z',
    value: 'M18 7c0-5.333-8-5.333-8 0M10 7v14M6 21h12M6 13h10',
    net: 'M4 12h16M12 4v16',
    chase: 'M4 16V8l8-4 8 4v8l-8 4-8-4z',
    savings: 'M5 10h14v8H5zM8 10V8a4 4 0 0 1 8 0v2',
    tax: 'M7 4h10v16H7zM9 8h6M9 12h6',
    isa: 'M12 4l8 4v6c0 4-3.5 6-8 8-4.5-2-8-4-8-8V8l8-4z',
  };
  return (
    <span className="stat-ico" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d={paths[name] || paths.income} />
      </svg>
    </span>
  );
}

function monthDelta(months, monthId, field) {
  const index = (months || []).findIndex((item) => item.id === monthId);
  if (index <= 0) return null;
  const current = months[index]?.[field];
  const prior = months[index - 1]?.[field];
  if (current == null || prior == null || !Number.isFinite(current) || !Number.isFinite(prior)) return null;
  return formatPounds(current - prior);
}

export function Tile({ label, value, icon = 'income', highlight = false, delta = null, note = null, onOpen }) {
  const down = typeof delta === 'string' && (delta.startsWith('-') || delta.includes('−'));
  return (
    <article className={highlight ? 'card glass hero' : 'card glass'} role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined} onClick={onOpen} onKeyDown={(event) => { if (onOpen && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpen(); } }}>
      <StatIcon name={icon} />
      <div className="k">{label}</div>
      <div className={value === '—' ? 'v num no-data' : 'v num'}>{value}</div>
      {delta ? <span className={down ? 'chip down' : 'chip'}>{down ? '↓' : '↑'} {delta} <em>vs last month</em></span> : <span className="no-prior">{note || 'No prior month'}</span>}
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
              <td>{group.actual.known ? showMoney(group.actual.minor) : <span className="no-data">No data</span>}</td>
              <td>{group.rawDifference == null ? <span className="no-data">No data</span> : formatPounds(group.rawDifference)}</td>
              <td>{group.judgement === 'unknown' ? <span className="no-data">No data</span> : group.judgement === 'incomplete' ? 'Incomplete' : group.direction}</td>
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
