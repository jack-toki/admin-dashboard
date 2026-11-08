import crypto from 'crypto';
import { canAccess, readSession } from '../../../../../lib/auth';
import { buildAuthorizeUrl, signOAuthState, xeroStatus } from '../../../../../lib/xero/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const session = readSession(req);
  if (!session || !canAccess(session, 'toki')) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const status = xeroStatus();
  if (status.state !== 'configured') return Response.json(status, { status: 409 });
  const nonce = crypto.randomBytes(16).toString('base64url');
  const state = signOAuthState({ nonce, exp: Date.now() + 10 * 60 * 1000, role: session.role }, process.env.DASHBOARD_SESSION_SECRET);
  const url = buildAuthorizeUrl({
    clientId: process.env.XERO_CLIENT_ID,
    redirectUri: process.env.XERO_REDIRECT_URI,
    state,
  });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return new Response(JSON.stringify({ ok: true, url }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'private, no-store',
      'set-cookie': `xero_oauth_state=${state}; HttpOnly; Path=/api/cockpit/xero; SameSite=Lax; Max-Age=600${secure}`,
    },
  });
}
