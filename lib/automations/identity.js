function norm(value) {
  return String(value || '').trim().toLowerCase();
}

// Profiles sheet ZapId cells are blank in the 28 Sep export, so title is only a fallback.
// Never rename a Zap and never pick a winner when two profiles share a title.

export function matchProfile(run, profiles) {
  const account = norm(run.account);
  const zapId = String(run.zapId || run.zap_id || '').trim();
  const title = norm(run.title || run.zap_title);
  const sameAccount = (profiles || []).filter((profile) => norm(profile.account) === account);
  const warnings = [];
  if (zapId) {
    const byId = sameAccount.filter((profile) => String(profile.zapId || '').trim() === zapId);
    if (byId.length === 1) return { profile: byId[0], via: 'zap_id', warnings };
    if (byId.length > 1) {
      return { profile: null, via: 'zap_id', warnings: ['zap_id_ambiguous'] };
    }
    warnings.push('zap_id_not_in_profiles');
  } else {
    warnings.push('run_missing_zap_id');
  }
  if (!title) return { profile: null, via: null, warnings: [...warnings, 'title_missing'] };
  const byTitle = sameAccount.filter((profile) => norm(profile.automation || profile.title) === title);
  const blankIds = sameAccount.filter((profile) => !String(profile.zapId || '').trim()).length;
  if (blankIds) warnings.push('profile_zap_id_blank');
  if (byTitle.length === 1) return { profile: byTitle[0], via: 'title_fallback', warnings };
  if (byTitle.length > 1) return { profile: null, via: 'title', warnings: [...warnings, 'title_ambiguous'] };
  return { profile: null, via: null, warnings: [...warnings, 'no_profile'] };
}
