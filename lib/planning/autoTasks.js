import { isMetricLabel } from '../forecast/sheetSync.js';
import { REQUIRED_FORECAST_INPUTS } from './requiredForecastInputs.js';

// The Toki month strip and the Outstanding checks use the current month in London.
// The ledger check looks at the month before that, which is the latest completed month.
export function currentTokiMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

export function forecastCellsFromRows(rows) {
  return (rows || []).flatMap((row) => Object.entries(row.cells || {}).map(([key, cell]) => ({
    label: row.label,
    kind: row.kind,
    rowNumber: row.rowNumber,
    month: key,
    enteredMinor: cell.blank ? null : cell.minor,
    amountMinor: cell.blank ? null : cell.minor,
    nullState: cell.blank ? 'blank' : 'amount',
  })));
}

export function openOutstandingItems(outstanding, autoTasks) {
  const manual = (outstanding || []).filter((item) => item && !item.doneAt);
  return [...manual, ...(autoTasks || [])];
}

function monthShift(period, delta) {
  if (!/^\d{4}-\d{2}$/.test(period || '')) return null;
  const date = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)) - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function deriveAutoTasks({
  period,
  cells = [],
  details = [],
  entries = [],
  posts = null,
  potsUpdated = true,
  dismissals = [],
} = {}) {
  const tasks = [];
  const previous = monthShift(period, -1);
  const dismissed = new Set((dismissals || []).map((row) => row.id || `${row.taskKey}:${row.period}`));

  function add(key, title, href) {
    const id = `${key}:${period}`;
    if (dismissed.has(id)) return;
    tasks.push({ id, taskKey: key, title, href, period, source: 'auto' });
  }

  const missing = missingForecastInputs(cells, period);
  if (missing.length) add('sheet-gaps', `${missing.length} forecast input${missing.length === 1 ? '' : 's'} missing in ${period}`, '/cockpit#toki');

  const openRetainers = (details || []).filter((row) => row.kind === 'retainer' && !row.deletedAt && !row.contractEndDate && !row.contractEndUnknown);
  if (openRetainers.length) add('retainer-end', `${openRetainers.length} retainer${openRetainers.length === 1 ? '' : 's'} missing a contract end`, '/cockpit#sources');

  if (entries != null && previous && !(entries || []).some((row) => String(row.period || '').startsWith(previous))) {
    add('jrl-month', `JRL ledger has no ${previous} entry`, '/cockpit#jrl');
  }

  if (posts === 0) add('automations-silent', `No automation posts in ${period}`, '/cockpit#automations');

  if (potsUpdated === false) add('pots-stale', 'Money pots have not been updated', '/cockpit#jrl');

  return tasks;
}

function norm(label) {
  return String(label || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function cellMonth(cell) {
  const period = cell?.period == null ? '' : String(cell.period);
  const fromPeriod = period.match(/^(\d{4}-\d{2})/);
  if (fromPeriod) return fromPeriod[1];
  const month = cell?.month == null ? '' : String(cell.month);
  const fromMonth = month.match(/^(\d{4}-\d{2})/);
  return fromMonth ? fromMonth[1] : null;
}

function isFilled(cell) {
  if (cell?.nullState === 'blank' || cell?.cellState === 'blank') return false;
  if (cell?.enteredMinor != null || cell?.amountMinor != null) return true;
  return cell?.nullState === 'amount' || cell?.nullState === 'zero' || cell?.cellState === 'value' || cell?.cellState === 'zero';
}

function rowKey(cell) {
  const row = cell?.rowNumber ?? cell?.sourceRow;
  if (row != null && String(row) !== '') return `row:${row}`;
  return `label:${norm(cell?.label)}`;
}

export function missingForecastInputs(cells, period) {
  const required = new Set(REQUIRED_FORECAST_INPUTS.map(norm));
  const labels = [];
  const seen = new Set();
  for (const cell of cells || []) {
    if (cellMonth(cell) !== period || isFilled(cell)) continue;
    const key = rowKey(cell);
    const name = norm(cell.label);
    if (!name || seen.has(key)) continue;
    if ((cell.kind === 'metric' || isMetricLabel(cell.label)) && !required.has(name)) continue;
    if (cell.kind && !['revenue', 'cost', 'sale', 'metric'].includes(cell.kind)) continue;
    const others = (cells || []).filter((item) => rowKey(item) === key && cellMonth(item) && cellMonth(item) !== period);
    const filled = others.filter(isFilled).length;
    const usuallyFilled = others.length > 0 && filled > others.length / 2;
    if (!required.has(name) && !usuallyFilled) continue;
    seen.add(key);
    labels.push(cell.label);
  }
  return labels;
}
