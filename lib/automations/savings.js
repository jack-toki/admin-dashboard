import { CONFIG } from '../aggregate.js';

// The profiles sheet (SHEET_CSV_URL) stores outcome counts, not minutes.
// lib/aggregate.js CONFIG is 7 minutes and £50. That is the default when a Zap
// has no saved minutes and its title does not match a step type below.

const TYPE_MINUTES = [
  [/invoice/i, 6, 'Invoice step: 6 minutes a run'],
  [/quote/i, 8, 'Quote step: 8 minutes a run'],
  [/email|gmail/i, 4, 'Email step: 4 minutes a run'],
  [/document|pandadoc|agreement/i, 6, 'Document step: 6 minutes a run'],
  [/lead/i, 5, 'Lead step: 5 minutes a run'],
];

export const DEFAULT_HOURLY_RATE = CONFIG.hourlyRate;

export function minutesForZap(title, override) {
  if (Number.isFinite(Number(override)) && Number(override) > 0) {
    return { minutes: Number(override), formula: `Saved minutes for this Zap: ${Number(override)} a run` };
  }
  const match = TYPE_MINUTES.find(([pattern]) => pattern.test(String(title || '')));
  if (match) return { minutes: match[1], formula: match[2] };
  return { minutes: CONFIG.estMinutesPerRun, formula: `Default ${CONFIG.estMinutesPerRun} minutes a run. The profiles sheet does not store minutes.` };
}

export function moneySaved({ runs, minutes, hourlyRate = DEFAULT_HOURLY_RATE }) {
  const count = Number(runs) || 0;
  const mins = Number(minutes) || 0;
  const rate = Number(hourlyRate) || DEFAULT_HOURLY_RATE;
  const hours = (count * mins) / 60;
  const pounds = Math.round(hours * rate);
  return {
    hours,
    pounds,
    formula: `${count} runs × ${mins} min ÷ 60 × £${rate}/hour = £${pounds}`,
  };
}
