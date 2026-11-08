export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function organizationHint(email) {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf('@');
  if (at < 1) return null;
  return normalized.slice(at + 1);
}

// A domain is never an identity. A CRM task id is a lead, not a person.
export function identityKeys(contact) {
  const keys = [];
  if (contact.contactId) keys.push(`contact:${String(contact.contactId).trim()}`);
  const email = normalizeEmail(contact.email);
  if (email && email.includes('@')) keys.push(`email:${email}`);
  if (contact.leadId) keys.push(`lead:${String(contact.leadId).trim()}`);
  return keys;
}

export function samePerson(a, b) {
  const left = new Set(identityKeys(a).filter((key) => !key.startsWith('lead:')));
  const right = identityKeys(b).filter((key) => !key.startsWith('lead:'));
  return right.some((key) => left.has(key));
}

export function classifyNewConversation(input) {
  const leadSource = String(input.leadSource || '').toLowerCase();
  if (leadSource.includes('returning')) {
    return { classification: 'not_new', reason: 'lead_source_says_returning' };
  }
  if (input.priorKnowledge === 'knew_toki') {
    return { classification: 'not_new', reason: 'prior_knowledge' };
  }
  const evidence = input.evidence || 'none';
  const positive = evidence === 'held' || evidence === 'user_confirmed_first';
  if (!positive) {
    return {
      classification: 'needs_review',
      reason: 'no_positive_held_evidence',
      candidate: evidence === 'booked' || evidence === 'discovery' || evidence === 'calendar',
    };
  }
  if (input.priorKnowledge !== 'confirmed_unfamiliar' || input.historyComplete !== true) {
    return { classification: 'needs_review', reason: 'unfamiliarity_not_confirmed' };
  }
  return { classification: 'new', reason: 'confirmed_first_conversation' };
}

export function toPublicActivity(record) {
  return {
    leadId: record.leadId || null,
    classification: record.classification,
    reason: record.reason,
    organizationHint: record.organizationHint || null,
  };
}
