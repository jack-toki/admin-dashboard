// raw difference is always actual minus forecast, in one currency.
// Favourable depends on the kind: more revenue is favourable; more cost is not.

export function comparePair({
  kind,
  forecastMinor,
  actualMinor,
  currency = 'GBP',
  actualCurrency = currency,
  forecastCoverage = 'full',
  actualCoverage = 'full',
  actualKnown = true,
  basis = 'unknown',
  vat = 'unknown',
}) {
  const reasons = [];
  if (currency !== actualCurrency) reasons.push('currency_mismatch');
  if (basis !== 'accounting' && basis !== 'matched') reasons.push('basis_unconfirmed');
  if (vat === 'unknown') reasons.push('vat_unknown');
  if (forecastCoverage !== 'full') reasons.push('forecast_coverage');
  if (actualCoverage !== 'full') reasons.push('actual_coverage');
  if (!actualKnown || actualMinor == null) {
    return {
      rawDifference: null,
      percent: null,
      judgement: 'unknown',
      definitive: false,
      reason: 'actual_missing',
      reasons: ['actual_missing', ...reasons],
    };
  }
  if (forecastMinor == null) {
    return {
      rawDifference: null,
      percent: null,
      judgement: 'unknown',
      definitive: false,
      reason: 'forecast_missing',
      reasons: ['forecast_missing', ...reasons],
    };
  }
  const rawDifference = actualMinor - forecastMinor;
  let direction = 'level';
  if (rawDifference !== 0) {
    if (kind === 'revenue') direction = rawDifference > 0 ? 'favourable' : 'unfavourable';
    else direction = rawDifference < 0 ? 'favourable' : 'unfavourable';
  }
  const percent = forecastMinor === 0 ? null : rawDifference / forecastMinor;
  const definitive = reasons.length === 0 && (basis === 'accounting' || basis === 'matched');
  return {
    rawDifference,
    percent,
    percentReason: forecastMinor === 0 ? 'percent_undefined_forecast_zero' : null,
    direction,
    judgement: definitive ? direction : 'incomplete',
    definitive,
    reasons,
  };
}

export function ytd(pairs) {
  const included = (pairs || []).filter((pair) => pair.actualCoverage === 'full' && pair.forecastCoverage === 'full' && pair.actualKnown !== false);
  let forecast = 0;
  let actual = 0;
  let comparable = true;
  for (const pair of included) {
    if (pair.forecastMinor == null || pair.actualMinor == null) {
      comparable = false;
      continue;
    }
    forecast += pair.forecastMinor;
    actual += pair.actualMinor;
  }
  return {
    months: included.map((pair) => pair.month),
    excluded: (pairs || []).filter((pair) => !included.includes(pair)).map((pair) => pair.month),
    forecastMinor: comparable && included.length ? forecast : null,
    actualMinor: comparable && included.length ? actual : null,
  };
}
