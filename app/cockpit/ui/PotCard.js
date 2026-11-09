'use client';
import { useState } from 'react';
import { potViews } from '../../../lib/jrl/pots';

function pounds(value) {
  if (value == null || Number.isNaN(value)) return 'Not set';
  const sign = value < 0 ? '−' : '';
  return `${sign}£${Math.abs(Math.round(value)).toLocaleString('en-GB')}`;
}

function dated(value) {
  if (!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split('-');
  if (!year || !month) return null;
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const label = `${names[Number(month) - 1] || month} ${year}`;
  return day ? `${Number(day)} ${label}` : label;
}

export function PotCard({ record, ledger, portfolioAvailable, onChange, editable = true }) {
  const pots = potViews(record, ledger);
  const [editing, setEditing] = useState('');
  const [draft, setDraft] = useState({ amount: '', asOf: '', target: '' });

  function open(pot) {
    setEditing(pot.id);
    setDraft({
      amount: pot.balance == null ? '' : String(pot.balance),
      asOf: pot.asOf ? String(pot.asOf).slice(0, 10) : '',
      target: String(pot.target),
    });
  }

  async function save(pot) {
    const target = Number(draft.target);
    const next = {
      ...record,
      targets: { ...record.targets, [pot.id]: target },
      manual: { ...record.manual },
      usePortfolioValue: pot.id === 'investments' ? false : record.usePortfolioValue,
    };
    if (draft.amount === '') delete next.manual[pot.id];
    else next.manual[pot.id] = { amount: Number(draft.amount), asOf: draft.asOf || null };
    if (!(Number(draft.target) > 0)) return;
    const ok = await onChange(next);
    if (ok) setEditing('');
  }

  return (
    <section className="pot-card" aria-label="Four money pots">
      <header className="pot-head">
        <h2>Four money pots</h2>
        <details className="pot-help">
          <summary>About these pots</summary>
          <p>A purpose split, not an adviser rule. £10,000 is a placeholder, not a recommendation. Lifestyle is money set aside to spend, not a spending history. A manual amount is not checked against the other pots. Investments use a valuation, not the amount paid in.</p>
        </details>
      </header>
      <div className="pot-grid">
        {pots.map((pot) => (
          <article key={pot.id} className="pot">
            <div className="pot-target">
              <span>Target</span>
              <strong className="num">{pounds(pot.target)}</strong>
            </div>
            <h3>{pot.label}</h3>
            <p className="pot-balance num">{pot.known ? pounds(pot.balance) : 'Not set'}</p>
            <div className="pot-meter" aria-hidden="true">
              <i style={{ width: pot.known ? `${pot.progress * 100}%` : '0%' }} />
            </div>
            <p className="pot-status">
              {!pot.known && 'Not set'}
              {pot.known && pot.over > 0 && `${pounds(pot.over)} over · ${pot.percent}%`}
              {pot.known && pot.over === 0 && pot.remaining > 0 && `${pounds(pot.remaining)} left · ${pot.percent}%`}
              {pot.known && pot.remaining === 0 && pot.over === 0 && 'At target · 100%'}
            </p>
            {(pot.asOf || pot.manual || pot.source === 'hl_value') && (
              <p className="pot-meta">{pot.source === 'hl_value' ? 'Valuation' : pot.manual ? 'Manual' : ''}{dated(pot.asOf) ? ` · ${dated(pot.asOf)}` : ''}</p>
            )}
            {editable && editing === pot.id ? (
              <form className="pot-form" onSubmit={(event) => { event.preventDefault(); save(pot); }}>
                <label>Target<input aria-label={`${pot.label} target`} inputMode="decimal" value={draft.target} onChange={(event) => setDraft({ ...draft, target: event.target.value })} /></label>
                <label>Balance<input aria-label={`${pot.label} balance`} inputMode="decimal" placeholder="Amount" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /></label>
                <label>As of<input aria-label={`${pot.label} date`} type="date" value={draft.asOf} onChange={(event) => setDraft({ ...draft, asOf: event.target.value })} /></label>
                <div className="pot-actions">
                  <button type="submit">Save</button>
                  <button type="button" onClick={() => setEditing('')}>Cancel</button>
                </div>
              </form>
            ) : (
              <div className="pot-actions">
                {editable && !pot.known && <button type="button" onClick={() => open(pot)}>Add balance</button>}
                {editable && pot.known && <button type="button" onClick={() => open(pot)}>Edit</button>}
                {editable && pot.id === 'investments' && portfolioAvailable && pot.source !== 'hl_value' && (
                  <button type="button" onClick={() => {
                    const manual = { ...record.manual };
                    delete manual.investments;
                    onChange({ ...record, usePortfolioValue: true, manual });
                  }}>Use portfolio value</button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
      {!editable && <p className="pot-meta">Not saved on this server yet.</p>}
    </section>
  );
}
