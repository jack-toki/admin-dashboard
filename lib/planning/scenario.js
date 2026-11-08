export function scenarioAmount(minor, mode) {
  if (minor == null) return null;
  if (mode === 'best') return Math.round(minor * 1.1);
  if (mode === 'worst') return Math.round(minor * 0.9);
  return minor;
}

export function commentaryFromFacts(facts) {
  return (facts || []).filter((fact) => fact && fact.evidence && fact.text).map((fact) => ({
    text: fact.text,
    evidence: fact.evidence,
    period: fact.period || null,
  }));
}
