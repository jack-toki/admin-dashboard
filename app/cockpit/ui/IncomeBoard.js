'use client';
import { useState } from 'react';
import { formatPounds } from '../../../lib/money';
import { reconcileKind, scheduleFor, shownInMonth } from '../../../lib/planning/incomeDetail';

function money(minor) {
  if (minor == null || !Number.isFinite(minor)) return 'Missing information';
  return formatPounds(minor);
}

function blank(kind) {
  return { kind, party: '', services: '', amount: '', firstPaymentMonth: '', contractEndDate: '', totalPayments: '', comment: '' };
}

export function IncomeBoard({ month, records, stored, baselineRetainer, baselineProject, onSave, onRemove, costContent }) {
  const [pane, setPane] = useState('income');
  const [kind, setKind] = useState('retainer');
  const [editing, setEditing] = useState('');
  const [draft, setDraft] = useState(blank('retainer'));
  const [query, setQuery] = useState('');
  const [scheduleFilter, setScheduleFilter] = useState('all');

  const retainers = (records || []).filter((row) => row.kind === 'retainer');
  const projects = (records || []).filter((row) => row.kind === 'project');
  const costs = (records || []).filter((row) => row.kind === 'additional_cost' && row.observedMonth === month);
  const retainerGap = reconcileKind(records, baselineRetainer, month, 'retainer');
  const projectGap = reconcileKind(records, baselineProject, month, 'project');

  function start(nextKind, row) {
    setEditing(row?.id || 'new');
    setKind(nextKind);
    setDraft(row ? {
      id: row.id,
      kind: row.kind,
      party: row.party,
      services: row.services || '',
      amount: row.amountMinor == null ? '' : String(row.amountMinor / 100),
      firstPaymentMonth: row.firstPaymentMonth || '',
      contractEndDate: row.contractEndDate || '',
      totalPayments: row.totalPayments || '',
      comment: row.comment || '',
    } : blank(nextKind));
  }

  async function save(event) {
    event.preventDefault();
    const ok = await onSave({ ...draft, kind: draft.kind || kind, observedMonth: (draft.kind || kind) === 'additional_cost' ? month : draft.observedMonth });
    if (ok) setEditing('');
  }

  function column(title, rows, nextKind) {
    const visible = rows.filter((row) => shownInMonth(row, month)).filter((row) => {
      const schedule = scheduleFor(row, month);
      if (query && !`${row.party} ${row.services || ''}`.toLowerCase().includes(query.toLowerCase())) return false;
      if (scheduleFilter === 'missing') return schedule.state === 'unknown' || row.amountMinor == null;
      if (scheduleFilter === 'scheduled') return schedule.state === 'scheduled';
      return true;
    });
    return (
      <section className="income-col card glass" data-pane={nextKind} data-on={kind === nextKind || pane === 'income' ? 'true' : 'false'}>
        <header className="table-tools">
          <h2>{title}</h2>
          {stored && <button type="button" className="btn" onClick={() => start(nextKind)}>Add</button>}
        </header>
        <table>
          <thead><tr><th>Company</th><th>Amount</th><th>Schedule</th><th></th></tr></thead>
          <tbody>
            {visible.map((row) => {
              const schedule = scheduleFor(row, month);
              return (
                <tr key={row.id}>
                  <td><strong>{row.party}</strong></td>
                  <td>{row.amountMinor == null ? <em className="miss-pill">Missing</em> : formatPounds(row.amountMinor)}</td>
                  <td>{schedule.state === 'unknown' ? <em className="miss-pill">Missing</em> : <span className="status-dot">{schedule.label}</span>}{row.contractEndDate ? ` · ends ${row.contractEndDate}` : ''}</td>
                  <td>{stored && (
                    <div className="income-row-actions">
                      <button type="button" onClick={() => start(nextKind, row)}>Edit</button>
                      <button type="button" onClick={() => onRemove(row.id)}>Delete</button>
                    </div>
                  )}</td>
                </tr>
              );
            })}
            {!visible.length && <tr><td colSpan="4" className="income-empty">No {title.toLowerCase()} this month.</td></tr>}
          </tbody>
        </table>
      </section>
    );
  }

  return (
    <div className="income-board">
      {!stored && <p className="income-gap" role="status">Client lines are not saved on this server yet. The forecast is unchanged.</p>}
      <div className="table-tools">
        <input aria-label="Search clients" placeholder="Search" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select aria-label="Filter schedule" value={scheduleFilter} onChange={(event) => setScheduleFilter(event.target.value)}>
          <option value="all">All</option>
          <option value="scheduled">Scheduled</option>
          <option value="missing">Missing</option>
        </select>
      </div>
      <div className="income-tabs" role="tablist" aria-label="Income or costs">
        <button type="button" role="tab" aria-selected={pane === 'income'} onClick={() => setPane('income')}>Income</button>
        <button type="button" role="tab" aria-selected={pane === 'costs'} onClick={() => setPane('costs')}>Costs</button>
      </div>
      {pane === 'income' && (
        <>
          <div className="income-kind-tabs" role="tablist" aria-label="Retainers or projects">
            <button type="button" role="tab" aria-selected={kind === 'retainer'} onClick={() => setKind('retainer')}>Retainers</button>
            <button type="button" role="tab" aria-selected={kind === 'project'} onClick={() => setKind('project')}>Projects</button>
          </div>
          <p className="income-gap">Retainers {money(retainerGap.detail)}. Forecast {money(retainerGap.baseline)}. Difference {money(retainerGap.difference)}. Not added to the forecast.</p>
          <p className="income-gap">Projects {money(projectGap.detail)}. Forecast {money(projectGap.baseline)}. Difference {money(projectGap.difference)}. Not added to the forecast.</p>
          <div className="income-columns" data-kind={kind}>
            {column('Retainers', retainers, 'retainer')}
            {column('Projects', projects, 'project')}
          </div>
        </>
      )}
      {pane === 'costs' && (
        <div className="forecast-costs">
          {costContent}
        <section className="income-col">
          <header>
            <h2>Additional costs</h2>
            {stored && <button type="button" onClick={() => start('additional_cost')}>Add</button>}
          </header>
          <p className="income-gap">These costs are not in the grouped forecast.</p>
          <ul>
            {costs.map((row) => (
              <li key={row.id}>
                <div><strong>{row.party}</strong><span>{money(row.amountMinor)}</span></div>
                {stored && <button type="button" onClick={() => onRemove(row.id)}>Delete</button>}
              </li>
            ))}
            {!costs.length && <li className="income-empty">No additional costs this month.</li>}
          </ul>
        </section>
        </div>
      )}
      {stored && editing && (
        <form className="income-form" onSubmit={save}>
          <label>Company<input aria-label="Company" value={draft.party} onChange={(event) => setDraft({ ...draft, party: event.target.value })} /></label>
          <label>Amount<input aria-label="Amount in pounds" inputMode="decimal" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /></label>
          {(draft.kind || kind) !== 'additional_cost' && (
            <>
              <label>Type
                <select aria-label="Income type" value={draft.kind || kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value })}>
                  <option value="retainer">Retainer</option>
                  <option value="project">Project</option>
                </select>
              </label>
              <label>First payment<input aria-label="First payment month" type="month" value={draft.firstPaymentMonth} onChange={(event) => setDraft({ ...draft, firstPaymentMonth: event.target.value })} /></label>
              <label>Contract end<input aria-label="Contract end date" type="date" value={draft.contractEndDate} onChange={(event) => setDraft({ ...draft, contractEndDate: event.target.value })} /></label>
            </>
          )}
          <div className="income-row-actions">
            <button type="submit">Save</button>
            <button type="button" onClick={() => setEditing('')}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
