import { CONFIG } from '../aggregate.js';

// The profiles sheet stores outcome counts, not minutes or money.
// 7 minutes and £50/hour live in lib/aggregate.js CONFIG. They are assumptions.

export function codeAssumptions() {
  return {
    minutesPerRun: CONFIG.estMinutesPerRun,
    hourlyRate: CONFIG.hourlyRate,
    currency: 'GBP',
    timeUnit: 'minutes',
    basis: 'code_assumption',
    measured: false,
    source: 'lib/aggregate.js CONFIG',
    sheetSupplies: 'outcome counts only',
  };
}

export function summariseObservations(events) {
  const list = events || [];
  const checkpoints = [];
  const seenEvents = new Set();
  const runIds = new Set();
  let missingRunId = 0;
  for (const event of list) {
    if (event.eventId) {
      if (seenEvents.has(event.eventId)) continue;
      seenEvents.add(event.eventId);
    }
    checkpoints.push(event);
    if (event.runId) runIds.add(String(event.runId));
    else missingRunId += 1;
  }
  return {
    checkpointPosts: checkpoints.length,
    uniqueRuns: missingRunId ? null : runIds.size,
    uniqueRunsReason: missingRunId ? 'legacy_or_partial_events_have_no_run_id' : null,
    droppedByZapId: false,
  };
}

export function estimateSavings(summary, assumption = codeAssumptions()) {
  if (summary.uniqueRuns == null) {
    return {
      withheld: true,
      reason: 'no_stable_run_id',
      estimated: null,
      label: 'Not computed. Legacy posts have no run id, and several Zaps emit more than one checkpoint. Multiplying every post by the minute assumption would not be a run count.',
      assumption,
    };
  }
  const hours = (summary.uniqueRuns * assumption.minutesPerRun) / 60;
  const minor = Math.round(hours * assumption.hourlyRate * 100);
  return {
    withheld: false,
    hours,
    minor,
    currency: 'GBP',
    label: 'Estimated from the code assumption and observed unique run ids. Not measured time.',
    measured: false,
    assumption,
  };
}
