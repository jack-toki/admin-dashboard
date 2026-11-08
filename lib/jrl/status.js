import { jrlAuthGap } from './reader.js';

// The personal app has no /cockpit route. This VM still cannot read that git
// repo; the shell below follows the sanitised packet, not a live ledger.

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
    jrlRoutes: ['/', '/month', '/targets', '/spending', '/sora', '/login'],
    cockpitIsNotAjrlRoute: true,
    blocker: 'JRL figures need the separate Supabase user session and the anon key. The cockpit password does not create that session, and the service role is not used to fill the gap. No personal rows are copied into Toki.',
  };
}

export function jrlView(session, env = process.env) {
  if (!session?.areas?.includes('jrl')) {
    return { status: 403, body: { error: 'forbidden', area: 'jrl' } };
  }
  const auth = jrlAuthGap(env);
  return {
    status: 200,
    body: {
      area: 'jrl',
      source: jrlStatus(),
      entries: [],
      balances: null,
      auth,
    },
  };
}
