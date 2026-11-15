// The live monitoring page (app/page.js) offers Today, This week, This month,
// Last month, 90 days, and All time. Jack also named Yesterday, Last 7 days,
// Last week, and Last 30 days. Those extra names were not in the committed
// control, so they are included here with the same window rules.
// Days start and end on Europe/London midnights. An open range ends at `now`.

export const AUTOMATION_RANGES = [
  ['Today', 'today'],
  ['Yesterday', 'yesterday'],
  ['This week', 'this-week'],
  ['Last 7 days', 'last-7-days'],
  ['Last week', 'last-week'],
  ['This month', 'this-month'],
  ['Last month', 'last-month'],
  ['Last 30 days', 'last-30-days'],
  ['90 days', '90-days'],
  ['All time', 'all-time'],
];

const KNOWN = new Set(AUTOMATION_RANGES.map(([, id]) => id));

export function londonParts(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type) => Number(parts.find((part) => part.type === type)?.value);
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

export function londonMidnight(year, month, day) {
  let utc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const format = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = format.formatToParts(new Date(utc));
    const pick = (type) => Number(parts.find((part) => part.type === type)?.value);
    const got = Date.UTC(pick('year'), pick('month') - 1, pick('day'), pick('hour'), pick('minute'), pick('second'));
    const want = Date.UTC(year, month - 1, day, 0, 0, 0);
    if (got === want) return new Date(utc);
    utc += want - got;
  }
  return new Date(utc);
}

function shiftDate(year, month, day, delta) {
  const date = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function weekday(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function rangeWindow(id, now = new Date()) {
  const key = KNOWN.has(id) ? id : 'this-month';
  const label = AUTOMATION_RANGES.find(([, value]) => value === key)?.[0] || 'This month';
  const { year, month, day } = londonParts(now);
  const today = londonMidnight(year, month, day);
  const sinceMonday = weekday(year, month, day) === 0 ? 6 : weekday(year, month, day) - 1;
  const thisMonday = shiftDate(year, month, day, -sinceMonday);
  const lastMonday = shiftDate(thisMonday.year, thisMonday.month, thisMonday.day, -7);
  const yesterday = shiftDate(year, month, day, -1);
  const last7 = shiftDate(year, month, day, -6);
  const last30 = shiftDate(year, month, day, -29);
  const last90 = shiftDate(year, month, day, -89);
  let from = today;
  let to = now;
  if (key === 'yesterday') {
    from = londonMidnight(yesterday.year, yesterday.month, yesterday.day);
    to = today;
  } else if (key === 'this-week') {
    from = londonMidnight(thisMonday.year, thisMonday.month, thisMonday.day);
  } else if (key === 'last-7-days') {
    from = londonMidnight(last7.year, last7.month, last7.day);
  } else if (key === 'last-week') {
    from = londonMidnight(lastMonday.year, lastMonday.month, lastMonday.day);
    to = londonMidnight(thisMonday.year, thisMonday.month, thisMonday.day);
  } else if (key === 'this-month') {
    from = londonMidnight(year, month, 1);
  } else if (key === 'last-month') {
    const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
    from = londonMidnight(previous.year, previous.month, 1);
    to = londonMidnight(year, month, 1);
  } else if (key === 'last-30-days') {
    from = londonMidnight(last30.year, last30.month, last30.day);
  } else if (key === '90-days') {
    from = londonMidnight(last90.year, last90.month, last90.day);
  } else if (key === 'all-time') {
    from = londonMidnight(2000, 1, 1);
  }
  return { id: key, label, from, to };
}
