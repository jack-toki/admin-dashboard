// The month control uses a 1-based month number with Date.UTC, which expects
// a 0-based month. The first option is therefore the month after the default.
// The default itself is the previous UTC month. Keep that window.

function key(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function monthWindow(now = new Date()) {
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const monthNumber = previous.getUTCMonth() + 1;
  const year = previous.getUTCFullYear();
  const options = [];
  for (let i = 0; i < 24; i += 1) {
    options.push(key(new Date(Date.UTC(year, monthNumber - i, 1))));
  }
  return { defaultPeriod: key(previous), options };
}
