// Integer minor units. Blank is unknown, never zero. Currencies are never combined.

export function parseAmount(raw) {
  if (raw == null) return { ok: false, reason: 'blank' };
  let s = String(raw).trim();
  if (!s || s === '-' || s === '—') return { ok: false, reason: 'blank' };
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/[£$€\s]/g, '');
  if (s.startsWith('+')) return { ok: false, reason: 'unparsed', raw: String(raw) };
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^[0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?$/.test(s)) {
    return { ok: false, reason: 'unparsed', raw: String(raw) };
  }
  const normalized = s.replace(/,/g, '');
  const [whole, frac = ''] = normalized.split('.');
  if (frac.length > 2) return { ok: false, reason: 'too_many_decimals', raw: String(raw) };
  const minorAbs = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isSafeInteger(minorAbs)) return { ok: false, reason: 'unsafe', raw: String(raw) };
  const minor = negative ? -minorAbs : minorAbs;
  return { ok: true, minor, currencyHint: null };
}

export function formatPounds(minor) {
  if (minor == null || !Number.isFinite(minor)) return '—';
  const neg = minor < 0;
  const abs = Math.abs(minor);
  return `${neg ? '-' : ''}£${Math.floor(abs / 100).toLocaleString('en-GB')}.${String(abs % 100).padStart(2, '0')}`;
}

export function formatMinor(minor, currency = 'GBP') {
  if (minor == null || !Number.isFinite(minor)) return '—';
  const neg = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  const code = currency || 'GBP';
  return `${neg ? '-' : ''}${code} ${whole.toLocaleString('en-GB')}.${frac}`;
}

export function addMinor(values) {
  let total = 0;
  let seen = 0;
  let blanks = 0;
  for (const value of values) {
    if (value == null) {
      blanks += 1;
      continue;
    }
    total += value;
    seen += 1;
  }
  if (!seen) return { minor: null, blanks, complete: blanks === 0 };
  return { minor: total, blanks, complete: blanks === 0 };
}
