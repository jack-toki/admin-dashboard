import { canAccess, readSession } from '../../../../../lib/auth';
import { verifyOAuthState } from '../../../../../lib/xero/oauth';
import { finishOAuth } from '../../../../../lib/oauth/finish.js';
import { openAppStore } from '../../../../../lib/store/index.js';

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
  const payload = verifyOAuthState(state, process.env.DASHBOARD_SESSION_SECRET);
  if (!state || state !== cookieState || !payload) {
    return Response.json({ error: 'csrf' }, { status: 400 });
  }
  if (!url.searchParams.get('code')) return Response.json({ error: 'missing_code' }, { status: 400 });
  const opened = openAppStore();
  const result = await finishOAuth({
    store: opened.ok ? opened.store : null,
    nonce: payload.nonce,
    code: url.searchParams.get('code'),
    provider: 'xero',
  });
  return Response.json(result.body, { status: result.status, headers: { 'cache-control': 'private, no-store' } });
}
