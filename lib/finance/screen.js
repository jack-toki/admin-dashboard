import { GROUPS, operationalGroup } from '../groups.js';
import { comparePair } from '../pnl/variance.js';
import { scenarioAmount } from '../planning/scenario.js';
import { expandTimeline } from '../planning/entries.js';
import { summariseObservations, estimateSavings } from '../automations/value.js';
import { healthFor } from '../automations/registry.js';
import { classifyNewConversation, samePerson } from '../activity/identity.js';
import { commentaryFromFacts } from '../planning/scenario.js';

export function linesForGroup(rows, groupId) {
  return (rows || []).filter((row) => operationalGroup(row) === groupId);
}

export function groupForecast(rows, groupId, month) {
  const lines = linesForGroup(rows, groupId);
  if (!lines.length) return { minor: null, reason: 'no_forecast_lines', incomplete: false };
  let total = 0;
  let seen = 0;
  let blanks = 0;
  for (const line of lines) {
    const cell = line.cells?.[month];
    if (!cell || cell.blank || cell.minor == null) blanks += 1;
    else {
      total += cell.minor;
      seen += 1;
    }
  }
  if (!seen) return { minor: null, reason: 'blank', incomplete: true };
  return { minor: total, reason: null, incomplete: blanks > 0 };
}

export function actualForGroup(actualMonth, groupId, peopleKnown) {
  if (!actualMonth) return { minor: null, known: false, coverage: 'missing' };
  if (groupId === 'people' && peopleKnown === false) return { minor: null, known: false, coverage: actualMonth.coverage || 'missing' };
  if (groupId === 'billing') {
    return { minor: actualMonth.billing ?? null, known: actualMonth.billing != null, coverage: actualMonth.coverage || 'missing' };
  }
  const value = actualMonth[groupId];
  return { minor: value ?? null, known: value != null, coverage: actualMonth.coverage || 'missing' };
}

export function compareGroup({ rows, actuals, group, month }) {
  const forecast = groupForecast(rows, group.id, month);
  const actual = actualForGroup(actuals?.months?.[month], group.id, actuals?.peopleKnown !== false && group.id === 'people' ? true : actuals?.peopleKnown);
  const pair = comparePair({
    kind: group.kind,
    forecastMinor: forecast.minor,
    actualMinor: actual.minor,
    actualKnown: actual.known,
    actualCoverage: actual.coverage === 'missing' ? 'missing' : actual.coverage,
    forecastCoverage: forecast.minor == null ? 'missing' : forecast.incomplete ? 'partial' : 'full',
    basis: actuals?.basis || 'unknown',
    vat: actuals?.vat || 'unknown',
  });
  return { groupId: group.id, label: group.label, kind: group.kind, forecast, actual, ...pair };
}

export function overview(model, actuals, month) {
  const groups = GROUPS.map((group) => compareGroup({ rows: model.rows, actuals, group, month }));
  const revenue = groups.find((group) => group.groupId === 'billing');
  const costs = groups.filter((group) => group.kind === 'cost' && group.forecast.minor != null);
  const costTotal = costs.reduce((sum, group) => sum + group.forecast.minor, 0);
  return {
    groups,
    revenueMinor: revenue?.forecast.minor ?? null,
    costMinor: costs.length ? costTotal : null,
    resultMinor: revenue?.forecast.minor != null && costs.length ? revenue.forecast.minor - costTotal : null,
  };
}

export function drilldown(model, month) {
  return (model.rows || []).filter((row) => row.kind === 'revenue' || row.kind === 'cost' || row.kind === 'metric').map((row) => ({
    label: row.label,
    kind: row.kind,
    groupId: row.group?.groupId || null,
    suggested: row.group?.sourceConfirmed === false,
    minor: row.cells?.[month]?.blank ? null : row.cells?.[month]?.minor ?? null,
  }));
}

export function withScenario(rows, mode) {
  return (rows || []).map((row) => ({
    ...row,
    cells: Object.fromEntries(Object.entries(row.cells || {}).map(([key, cell]) => [key, {
      ...cell,
      minor: cell.blank ? null : scenarioAmount(cell.minor, mode),
    }])),
  }));
}

export function recurringCostMonths(entry) {
  return expandTimeline(entry);
}

export function pipelineRow(deal) {
  const known = deal.probability != null && Number.isFinite(Number(deal.probability));
  return {
    leadId: deal.leadId,
    label: deal.label,
    status: deal.status,
    amountMinor: deal.amountMinor ?? null,
    probability: known ? Number(deal.probability) : null,
    probabilityKnown: known,
    weightedMinor: known && deal.amountMinor != null ? Math.round(deal.amountMinor * Number(deal.probability)) : null,
    inFinancialPlan: false,
  };
}

export function reviewActivity(contacts) {
  return (contacts || []).map((contact) => {
    const result = classifyNewConversation(contact);
    return {
      leadId: contact.leadId,
      label: contact.label,
      classification: result.classification,
      reason: result.reason,
      sameAs: (contacts || []).filter((other) => other !== contact && samePerson(contact, other)).map((other) => other.leadId),
    };
  });
}

export function weeklyCommentary(facts) {
  return commentaryFromFacts(facts);
}

export function automationBoard(workflows, events) {
  const summary = summariseObservations(events);
  return {
    rows: (workflows || []).map((workflow) => ({
      ...workflow,
      health: healthFor(workflow, events),
    })),
    checkpoints: summary.checkpointPosts,
    uniqueRuns: summary.uniqueRuns,
    savings: estimateSavings(summary),
  };
}
