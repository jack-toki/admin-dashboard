import { canAccess, readSession } from '../../../../../lib/auth';
import { verifyOAuthState } from '../../../../../lib/xero/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const session = readSession(req);
  if (!session || !canAccess(session, 'toki')) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const url = new URL(req.url);
  const state = url.searchParams.get('state') || '';
  const cookie = (req.headers.get('cookie') || '').match(/(?:^|;\s*)xero_oauth_state=([^;]+)/);
  const cookieState = cookie ? decodeURIComponent(cookie[1]) : '';
  if (!state || state !== cookieState || !verifyOAuthState(state, process.env.DASHBOARD_SESSION_SECRET)) {
    return Response.json({ error: 'csrf' }, { status: 400 });
  }
  if (!url.searchParams.get('code')) return Response.json({ error: 'missing_code' }, { status: 400 });
  return Response.json({
    ok: false,
    error: 'token_exchange_not_run',
    reason: 'Callback identity matched. Token exchange stays disabled until Xero client credentials are present and a store outside this repo is configured. No accounting transaction was created.',
  }, { status: 409 });
}
