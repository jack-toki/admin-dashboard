// Vercel confirmed jrl-finance on 2026-11-08 12:39 GMT. GitHub still returns 404
// for this credential, so no personal ledger is copied from that repo.
// There is no Vercel project named cockpit. This app's cockpit is /cockpit.

export function jrlStatus() {
  return {
    state: 'separate_project',
    connected: false,
    ledger: 'not_loaded',
    repo: 'jack-toki/jrl-finance',
    repoVisible: false,
    projectId: 'prj_Dex1ZaIzPtGXJaDtXykKCFsHkw9k',
    projectIdVerified: true,
    verifiedAt: '2026-11-08T12:39:00Z',
    production: {
      branch: 'main',
      latestReady: '2026-09-28',
      deploymentId: 'dpl_CFkZVwFAUPY68rF9ANMXDAZfXYE7',
      liveFlag: false,
      liveFlagNote: 'The project live flag was false while the production deployment was READY. That is not treated as an outage.',
    },
    aliases: [
      'jrl-finance.vercel.app',
      'jrl-finance-toki12.vercel.app',
      'jrl-finance-git-main-toki12.vercel.app',
    ],
    customDomain: null,
    protection: 'vercel_sso',
    cockpitProject: null,
    cockpitRouteInThisRepo: '/cockpit',
    blocker: 'Vercel confirms jrl-finance as its own Next.js project. This GitHub credential cannot read that repository, so its pages were not copied. Personal balances stay out of Toki. No Vercel project is named cockpit.',
  };
}

export function jrlView(session) {
  if (!session?.areas?.includes('jrl')) {
    return { status: 403, body: { error: 'forbidden', area: 'jrl' } };
  }
  return { status: 200, body: { area: 'jrl', source: jrlStatus(), entries: [] } };
}
