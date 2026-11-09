export function periodMonth(period) {
  const match = String(period || '').match(/^(\d{4}-\d{2})/);
  return match ? match[1] : '';
}

export function ledgerYears(rows) {
  return [...new Set((rows || []).map((row) => periodMonth(row.period).slice(0, 4)).filter((year) => /^\d{4}$/.test(year)))].sort();
}

export function applyRange(rows, range = {}, now = new Date()) {
  const list = Array.isArray(rows) ? rows : [];
  const preset = range.preset || 'all';
  let from = String(range.from || '').slice(0, 7);
  let to = String(range.to || '').slice(0, 7);
  const year = Number(range.year) || now.getFullYear();
  if (preset === 'year') {
    from = `${year}-01`;
    to = `${year}-12`;
  } else if (preset === 'last') {
    const date = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
    let key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const known = list.map((row) => periodMonth(row.period)).filter(Boolean).sort();
    if (!known.includes(key)) key = known.at(-1) || key;
    from = key;
    to = key;
  } else if (preset === 'all') {
    from = '';
    to = '';
  }
  const filtered = list.filter((row) => {
    const month = periodMonth(row.period);
    if (!month) return false;
    if (from && month < from) return false;
    if (to && month > to) return false;
    return true;
  });
  return { rows: filtered, from, to, sourceCount: list.length };
}

const MONTHS = [
  ['01', 'Jan'], ['02', 'Feb'], ['03', 'Mar'], ['04', 'Apr'], ['05', 'May'], ['06', 'Jun'],
  ['07', 'Jul'], ['08', 'Aug'], ['09', 'Sep'], ['10', 'Oct'], ['11', 'Nov'], ['12', 'Dec'],
];

export function yearOverlay(rows, valueOf) {
  const points = MONTHS.map(([id, label]) => ({ id, label }));
  const years = ledgerYears(rows);
  const series = years.map((year) => ({
    id: year,
    label: year,
    kind: 'history',
    values: MONTHS.map(([month]) => {
      const row = (rows || []).find((item) => periodMonth(item.period) === `${year}-${month}`);
      const value = row ? valueOf(row) : null;
      return { id: month, value: value == null || !Number.isFinite(Number(value)) ? null : Number(value), status: 'Tracked' };
    }),
  }));
  return { points, series };
}

export function forecastRate(tracked, months) {
  if (months >= 12 && tracked != null && Number.isFinite(tracked)) return { rate: tracked, benchmark: false, caveat: false };
  return { rate: 0.07, benchmark: true, caveat: months < 12 };
}

export function stateAnnualRate({ current, contributed, months } = {}) {
  if (!(current > 0) || !(contributed > 0) || !(months > 0)) return null;
  const multiple = current / contributed;
  if (!(multiple > 0)) return null;
  const rate = multiple ** (12 / months) - 1;
  return Number.isFinite(rate) ? rate : null;
}

export function futureValue({ current, annualRate, years, monthlyAdd = 0 }) {
  const months = Number(years) * 12;
  const add = Number(monthlyAdd) || 0;
  const rate = Number.isFinite(annualRate) ? annualRate : 0;
  const monthly = (1 + rate) ** (1 / 12) - 1;
  if (!Number.isFinite(months) || months < 0) return null;
  if (!Number.isFinite(monthly) || Math.abs(monthly) < 1e-10) return current + add * months;
  return current * (1 + monthly) ** months + add * (((1 + monthly) ** months - 1) / monthly);
}

function monthIndex(id) {
  const match = String(id || '').match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 12 + Number(match[2]);
}

export function axisFrame({ width = 640, height = 168 } = {}) {
  const padL = 96;
  const padR = 28;
  const padT = 28;
  const padB = 44;
  return {
    padL,
    padR,
    padT,
    padB,
    yTitle: { x: padL - 8, y: 12, anchor: 'end' },
    xTitle: { x: (padL + width - padR) / 2, y: height - 4, anchor: 'middle' },
    tickTop: padT + 4,
    labelY: height - 20,
  };
}

export function pointFraction(points, index) {
  const timed = (points || []).some((point) => Number.isFinite(point?.years));
  if (!timed) return index / Math.max((points || []).length - 1, 1);
  const years = points.map((point) => (Number.isFinite(point.years) ? point.years : 0));
  const min = Math.min(0, ...years);
  const max = Math.max(20, ...years);
  const span = max - min || 1;
  const year = Number.isFinite(points[index]?.years) ? points[index].years : 0;
  return (year - min) / span;
}

export function forecastSeries({ history = [], current, annualRate, monthsOfHistory, overlays = [] }) {
  const real = (history || []).filter((row) => row && row.value != null && Number.isFinite(Number(row.value)));
  const future = [1, 2, 3, 4, 5, 10, 15, 20];
  const endMonth = real.reduce((max, row) => {
    const index = monthIndex(row.id);
    return index == null ? max : Math.max(max, index);
  }, null);
  const points = [
    ...real.map((row) => {
      const index = monthIndex(row.id);
      const years = endMonth == null || index == null ? 0 : (index - endMonth) / 12;
      return {
        id: `h-${row.id}`,
        label: years < 0 ? '' : row.label,
        years,
      };
    }),
    ...future.map((year) => ({ id: `y-${year}`, label: `${year}y`, years: year })),
  ];
  if (!real.length && current != null) points.unshift({ id: 'now', label: 'Now' });
  const at = (id, value, status) => ({ id, value, status });
  const historyValues = points.map((point) => {
    if (String(point.id).startsWith('h-')) {
      const row = real.find((item) => `h-${item.id}` === point.id);
      return at(point.id, row ? Number(row.value) : null, 'Tracked history');
    }
    return at(point.id, null, 'Tracked history');
  });
  const anchor = real.length ? `h-${real[real.length - 1].id}` : 'now';
  const forecastValues = (monthlyAdd, status) => points.map((point) => {
    if (point.id === anchor) return at(point.id, current, status);
    if (!point.years || annualRate == null || current == null) return at(point.id, null, status);
    return at(point.id, futureValue({ current, annualRate, years: point.years, monthlyAdd }), status);
  });
  const series = [{ id: 'tracked', label: 'Tracked', kind: 'history', values: historyValues }];
  for (const overlay of overlays) {
    if (!overlay?.on) continue;
    series.push({
      id: overlay.id,
      label: overlay.label,
      kind: 'forecast',
      values: forecastValues(overlay.monthly, overlay.label),
    });
  }
  return { points, series, caveat: monthsOfHistory < 12, rate: annualRate };
}
