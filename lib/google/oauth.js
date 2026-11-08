export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

export function googleStatus(env = process.env) {
  const names = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'];
  const missing = names.filter((name) => !env[name]);
  return {
    state: missing.length ? 'not_connected' : 'configured',
    missing,
    grant: 'authorization_code',
    scope: GOOGLE_SCOPE,
    writes: false,
    serviceAccountOptional: true,
  };
}

export function buildGoogleAuthorizeUrl({ clientId, redirectUri, state }) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', GOOGLE_SCOPE);
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}
