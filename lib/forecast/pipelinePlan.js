import { numericSheetValue, decideSheetWrite, poundsFromMinor } from './sheetSync.js';

// Private planning tab. Not published. Labels below are the ones on the Sheet.
export const PIPELINE_TAB = 'Pipeline Forecast V2';
export const PIPELINE_SHEET_ID = 332229385;
export const PIPELINE_RANGE = "'Pipeline Forecast V2'!A1:P120";

const SUMMARY = new Set(['target', 'total revenue', 'active', 'gap', 'potential']);

export const PIPELINE_STAGES = [
  { id: '75', match: /^75%/ },
  { id: '50', match: /^50%/ },
  { id: '25', match: /^25%/ },
  { id: '10', match: /^10%/ },
];

function stageId(label) {
  const hit = PIPELINE_STAGES.find((stage) => stage.match.test(String(label || '')));
  return hit ? hit.id : '';
}

function blankStages() {
  return Object.fromEntries(PIPELINE_STAGES.map((stage) => [stage.id, { id: stage.id, deals: [], slots: [] }]));
}

function columnLetters(index) {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function clean(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function currentMonthKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit' }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value || '0000';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  return `${year}-${month}`;
}

function excelSerial(value) {
  const number = typeof value === 'number' ? value : /^\d+(\.\d+)?$/.test(String(value ?? '').trim()) ? Number(value) : NaN;
  if (!Number.isFinite(number) || number <= 20000 || number >= 80000) return null;
  return Math.round(number);
}

export function sheetMonth(value) {
  const serial = excelSerial(value);
  if (serial != null) {
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    const key = date.toISOString().slice(0, 7);
    return { key, label: `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}` };
  }
  const text = clean(value);
  const named = text.match(/^([A-Za-z]{3})[-\s](\d{2,4})$/);
  if (named) {
    const month = MONTH_NAMES.findIndex((name) => name.toLowerCase() === named[1].toLowerCase());
    if (month >= 0) {
      const year = named[2].length === 2 ? 2000 + Number(named[2]) : Number(named[2]);
      return { key: `${year}-${String(month + 1).padStart(2, '0')}`, label: `${MONTH_NAMES[month]} ${year}` };
    }
  }
  return { key: text, label: text };
}

export function monthInWindow(key, { past = '12', future = '12', now = currentMonthKey() } = {}) {
  if (!/^\d{4}-\d{2}$/.test(String(key || ''))) return true;
  const [year, month] = key.split('-').map(Number);
  const [nowYear, nowMonth] = String(now).split('-').map(Number);
  const diff = (year - nowYear) * 12 + (month - nowMonth);
  if (diff === 0) return past !== 'year';
  if (diff < 0) {
    if (past === 'none') return false;
    if (past === 'year') return year === nowYear - 1;
    return diff >= -Number(past);
  }
  if (future === 'none') return false;
  return diff <= Number(future);
}

export function focusPlan(plan, options = {}) {
  const meta = (plan?.monthKeys || []).map((key, index) => ({ key, label: plan.months[index], index }));
  const source = meta.length ? meta : (plan?.months || []).map((label, index) => ({ index, ...sheetMonth(label) }));
  const keep = source.filter((month) => monthInWindow(month.key, options));
  const indexes = keep.map((month) => month.index);
  return {
    ...plan,
    months: keep.map((month) => month.label),
    monthKeys: keep.map((month) => month.key),
    rows: (plan?.rows || []).map((row) => ({ ...row, cells: indexes.map((index) => row.cells[index]) })),
  };
}

function isSection(label) {
  return /^\d+%/.test(label) || /^(projects|retainers|hosting|pipeline|backburner)$/i.test(label);
}

function cellAt(values, formulas, row, column) {
  const raw = values?.[row]?.[column] ?? '';
  const formula = String(formulas?.[row]?.[column] || '').trim();
  const formulaCell = formula.startsWith('=');
  const display = raw == null || raw === '' ? '' : String(raw);
  const minor = numericSheetValue(raw);
  return {
    a1: `${columnLetters(column)}${row + 1}`,
    display,
    minor: minor == null ? null : Math.round(minor * 100),
    formula: formulaCell,
    input: !formulaCell && !/^total$/i.test(display.trim()) && minor != null,
  };
}

function rowAddress(rowIndex, column) {
  return `${columnLetters(column)}${rowIndex + 1}`;
}

function stageRow(rowIndex, cells, values) {
  return {
    row: rowIndex + 1,
    nameCell: rowAddress(rowIndex, 0),
    sourceCell: rowAddress(rowIndex, 1),
    workCell: rowAddress(rowIndex, 2),
    name: clean(values?.[rowIndex]?.[0]),
    source: clean(values?.[rowIndex]?.[1]),
    work: clean(values?.[rowIndex]?.[2]),
    months: cells.filter((cell) => !cell.formula).map((cell) => ({ header: cell.header, a1: cell.a1, minor: cell.minor })),
  };
}

export function parsePipelinePlan(values, formulas) {
  const header = values?.[1] || [];
  const months = [];
  header.forEach((label, index) => {
    if (index < 4) return;
    const month = sheetMonth(label);
    if (!month.key) return;
    months.push({ index, label: month.label, key: month.key });
  });
  const rows = [];
  const stages = blankStages();
  let section = '';
  let currentStage = '';
  for (let row = 0; row < (values || []).length; row += 1) {
    if (row === 1) continue;
    const sheetLabel = clean(values[row]?.[0]);
    const marker = clean(values[row]?.[3]);
    const cells = months.map((month) => ({ header: month.label, ...cellAt(values, formulas, row, month.index) }));
    const total = cellAt(values, formulas, row, 3);
    const hasMoney = cells.some((cell) => cell.display) || (total.display && !/^total$/i.test(total.display));
    let kind = 'line';
    if (SUMMARY.has(sheetLabel.toLowerCase())) kind = 'summary';
    else if (isSection(sheetLabel)) kind = 'section';
    else if (!sheetLabel && /^total$/i.test(marker)) kind = 'section-total';
    else if (!sheetLabel) kind = 'note';
    if (kind === 'section') {
      section = sheetLabel;
      currentStage = stageId(sheetLabel);
    } else if (currentStage && !/^total$/i.test(marker)) {
      const entry = stageRow(row, cells, values);
      if (sheetLabel) stages[currentStage].deals.push({ ...entry, stage: currentStage });
      else stages[currentStage].slots.push(entry);
    }
    if (!sheetLabel && !hasMoney && !/^total$/i.test(marker)) continue;
    const editable = kind === 'line' || (kind === 'summary' && sheetLabel.toLowerCase() === 'target');
    if (editable) {
      for (const cell of cells) {
        if (!cell.formula) cell.input = true;
      }
      if (kind === 'line' && !total.formula && !/^total$/i.test(total.display.trim())) total.input = true;
    }
    rows.push({
      row: row + 1,
      label: sheetLabel || marker,
      sheetLabel,
      section,
      source: clean(values[row]?.[1]),
      work: clean(values[row]?.[2]),
      kind,
      total,
      cells,
    });
  }
  return {
    tab: PIPELINE_TAB,
    sheetId: PIPELINE_SHEET_ID,
    range: PIPELINE_RANGE,
    months: months.map((month) => month.label),
    monthKeys: months.map((month) => month.key),
    rows,
    stages,
  };
}

// Probability is the section header in column A (75%, 50%, 25%, 10%).
// A line does not store its own probability. Actual retainer and project
// amounts are the lines under the Retainers and Projects headers.
// Hosting, Backburner, and the Active formula are not segments.
function potentialLegend(sheet, fallback) {
  const match = String(sheet || '').match(/^(\d+)%/);
  if (!match) return String(fallback || '').replace(' · ', ' ');
  return `Potential ${match[1]}%`;
}

const STACK_SEGMENTS = [
  { id: 'actual-retainer', match: /^retainers$/i, label: 'Actual · Retainers', legend: 'Actual retainers', sheet: 'Retainers', family: 'actual', type: 'Retainer' },
  { id: 'actual-project', match: /^projects$/i, label: 'Actual · Projects', legend: 'Actual projects', sheet: 'Projects', family: 'actual', type: 'Project' },
  { id: 'potential-75', match: /^75%/, label: 'Potential · 75%', family: 'potential', type: null },
  { id: 'potential-50', match: /^50%/, label: 'Potential · 50%', family: 'potential', type: null },
  { id: 'potential-25', match: /^25%/, label: 'Potential · 25%', family: 'potential', type: null },
  { id: 'potential-10', match: /^10%/, label: 'Potential · 10%', family: 'potential', type: null },
];

export function pipelineStack(plan) {
  const months = plan?.months || [];
  const lines = (plan?.rows || []).filter((row) => row.kind === 'line');
  const segments = STACK_SEGMENTS.map((segment) => {
    const section = (plan?.rows || []).find((row) => row.kind === 'section' && segment.match.test(row.sheetLabel));
    const sheet = section?.sheetLabel || segment.sheet || null;
    return { ...segment, sheet, legend: segment.legend || potentialLegend(sheet, segment.label) };
  });
  const columns = months.map((label, index) => {
    const parts = segments.map((segment) => {
      const clients = [];
      for (const row of lines) {
        if (!segment.match.test(row.section || '')) continue;
        const cell = row.cells[index];
        if (cell?.minor == null) continue;
        clients.push({
          name: row.sheetLabel || row.label,
          minor: cell.minor,
          type: segment.type,
          work: row.work || '',
        });
      }
      const minor = clients.reduce((sum, client) => sum + client.minor, 0);
      return { id: segment.id, label: segment.label, legend: segment.legend, sheet: segment.sheet, family: segment.family, type: segment.type, minor, clients };
    });
    const actual = parts.filter((part) => part.family === 'actual').reduce((sum, part) => sum + part.minor, 0);
    const potential = parts.filter((part) => part.family === 'potential').reduce((sum, part) => sum + part.minor, 0);
    return { id: label, label, segments: parts, actual, potential };
  });
  return {
    tierField: 'Pipeline Forecast V2 column A section header. Lines have no probability of their own.',
    segments: segments.map((segment) => ({ id: segment.id, label: segment.label, legend: segment.legend, sheet: segment.sheet, family: segment.family })),
    months: columns,
  };
}

export function pipelineChart(plan) {
  const stack = pipelineStack(plan);
  const targetRow = (plan?.rows || []).find((row) => row.kind === 'summary' && /^target$/i.test(row.sheetLabel));
  const months = stack.months.map((column, index) => {
    const retainers = column.segments.find((segment) => segment.id === 'actual-retainer')?.minor || 0;
    const projects = column.segments.find((segment) => segment.id === 'actual-project')?.minor || 0;
    const stages = column.segments.filter((segment) => segment.family === 'potential').map((segment) => ({
      id: segment.id,
      label: segment.legend || segment.label,
      minor: segment.minor,
      count: (segment.clients || []).filter((client) => client.minor > 0).length,
    }));
    const pipeline = stages.reduce((sum, stage) => sum + stage.minor, 0);
    const target = targetRow?.cells?.[index]?.minor ?? null;
    return {
      ...column,
      retainers,
      projects,
      actual: retainers + projects,
      stages,
      pipeline,
      pipelineCount: stages.reduce((sum, stage) => sum + stage.count, 0),
      target,
    };
  });
  const total = (pick) => months.reduce((sum, month) => sum + (pick(month) || 0), 0);
  return {
    months,
    tiles: [
      { label: 'Projects', minor: total((month) => month.projects) },
      { label: 'Retainers', minor: total((month) => month.retainers) },
      { label: 'Actual', minor: total((month) => month.actual) },
      { label: 'Pipeline', minor: total((month) => month.pipeline) },
      { label: 'Target', minor: total((month) => month.target) },
    ],
  };
}

export function standingDelta(month) {
  if (!month || month.target == null) return null;
  return month.actual - month.target;
}

function sheetRange(a1) {
  return `'${PIPELINE_TAB}'!${a1}`;
}

function textWrites(entry, { name, source, work }) {
  return [
    { range: sheetRange(entry.nameCell), value: name },
    { range: sheetRange(entry.sourceCell), value: source },
    { range: sheetRange(entry.workCell), value: work },
  ];
}

function clearWrites(entry) {
  return [
    { range: sheetRange(entry.nameCell), value: '' },
    { range: sheetRange(entry.sourceCell), value: '' },
    { range: sheetRange(entry.workCell), value: '' },
    ...entry.months.map((month) => ({ range: sheetRange(month.a1), value: '' })),
  ];
}

export function dealSheetWrites(plan, input) {
  const stage = String(input?.stage || '');
  const stages = plan?.stages || {};
  if (!stages[stage]) return { ok: false, error: 'stage' };
  const name = clean(input?.name);
  if (!name) return { ok: false, error: 'name' };
  const source = clean(input?.source);
  const work = clean(input?.work);
  const deals = PIPELINE_STAGES.flatMap((item) => stages[item.id]?.deals || []);
  if (input?.row) {
    const deal = deals.find((item) => item.row === Number(input.row));
    if (!deal) return { ok: false, error: 'missing' };
    if (deal.stage === stage) return { ok: true, writes: textWrites(deal, { name, source, work }) };
    const slot = (stages[stage].slots || [])[0];
    if (!slot) return { ok: false, error: 'stage_full' };
    const moved = new Map(deal.months.map((month) => [month.header, month.minor]));
    const amounts = slot.months.map((month) => ({
      range: sheetRange(month.a1),
      value: moved.has(month.header) && moved.get(month.header) != null ? poundsFromMinor(moved.get(month.header)) : '',
    }));
    return { ok: true, writes: [...textWrites(slot, { name, source, work }), ...amounts, ...clearWrites(deal)] };
  }
  const slot = (stages[stage].slots || [])[0];
  if (!slot) return { ok: false, error: 'stage_full' };
  return { ok: true, writes: textWrites(slot, { name, source, work }) };
}

export function pipelineView(plan) {
  const points = (plan?.months || []).map((label) => ({ id: label, label }));
  const valueOf = (cell) => (cell?.minor == null ? null : cell.minor / 100);
  const active = (plan?.rows || []).find((row) => row.sheetLabel.toLowerCase() === 'active');
  const series = [];
  if (active) {
    series.push({
      id: 'active',
      label: active.sheetLabel,
      kind: 'history',
      values: active.cells.map((cell) => ({ id: cell.header, value: valueOf(cell), status: 'Sheet total' })),
    });
  }
  let band = null;
  let buckets = null;
  function flushBand() {
    if (!band) return;
    series.push({
      id: band.sheetLabel,
      label: band.sheetLabel,
      kind: 'forecast',
      values: (plan?.months || []).map((label, index) => ({
        id: label,
        value: buckets[index] == null ? 0 : buckets[index],
        status: 'Scenario',
      })),
    });
    band = null;
    buckets = null;
  }
  for (const row of plan?.rows || []) {
    if (row.kind === 'section' && /^\d+%/.test(row.sheetLabel)) {
      flushBand();
      band = row;
      buckets = (plan?.months || []).map(() => null);
    } else if (row.kind === 'section') flushBand();
    else if (band && row.kind === 'line') {
      row.cells.forEach((cell, index) => {
        if (cell.minor == null) return;
        buckets[index] = (buckets[index] || 0) + cell.minor / 100;
      });
    }
  }
  flushBand();
  const tiles = [];
  if (active) tiles.push({ label: active.sheetLabel, minor: active.total.minor });
  for (const row of plan?.rows || []) {
    if (/^\d+%/.test(row.sheetLabel)) tiles.push({ label: row.sheetLabel, minor: row.total.minor });
  }
  return { points, series, tiles };
}

export function findPipelineCell(plan, a1) {
  for (const row of plan?.rows || []) {
    for (const cell of row.cells) {
      if (cell.a1 === a1) return { ...cell, label: row.sheetLabel || row.label, section: row.section };
    }
  }
  return null;
}

export function pipelineInputEdit(storedMinor, text) {
  const raw = String(text ?? '').replace(/£/g, '').replace(/,/g, '').trim();
  if (raw === '') {
    if (storedMinor == null) return { action: 'skip', reason: 'blank' };
    return { action: 'clear', next: '' };
  }
  const pounds = Number(raw);
  if (!Number.isFinite(pounds)) return { action: 'skip', reason: 'invalid' };
  if (storedMinor != null && Math.abs(pounds - Number(storedMinor) / 100) < 0.005) return { action: 'skip', reason: 'unchanged' };
  return { action: 'save', minor: Math.round(pounds * 100), next: poundsFromMinor(Math.round(pounds * 100)) };
}

export function preparePipelineWrite(cell, { current, stored, next, clear = false }) {
  if (!cell || cell.formula || !cell.input) return { action: 'skip', reason: 'formula' };
  const blankText = next == null || String(next).trim() === '';
  if (clear || blankText) {
    const sheetBlank = numericSheetValue(current) == null;
    const storedBlank = stored == null || String(stored).trim() === '' || numericSheetValue(stored) == null;
    if (sheetBlank && storedBlank) return { action: 'skip', reason: 'blank' };
    return decideSheetWrite({ current, lastSynced: stored, stored, next: '' });
  }
  return decideSheetWrite({ current, lastSynced: stored, stored, next: poundsFromMinor(next) });
}

