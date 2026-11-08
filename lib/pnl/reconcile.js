export function reconcileClientMonth({ month, baselineRetained, baselineProject, sheetRetained, sheetProject }) {
  return {
    month,
    overwritten: false,
    retained: side(baselineRetained, sheetRetained),
    project: side(baselineProject, sheetProject),
    note: 'The monthly client sheet is shown beside the first tab. It does not replace the first-tab figure.',
  };
}

function side(baseline, sheet) {
  if (baseline == null || sheet == null) {
    return { baseline: baseline ?? null, monthlySheet: sheet ?? null, difference: null, reason: 'one_side_missing' };
  }
  return { baseline, monthlySheet: sheet, difference: sheet - baseline, reason: null };
}
