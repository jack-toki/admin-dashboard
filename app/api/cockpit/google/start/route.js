import crypto from 'crypto';
import { canAccess, readSession } from '../../../../../lib/auth';
import { signOAuthState } from '../../../../../lib/xero/oauth';
import { buildGoogleAuthorizeUrl, googleStatus } from '../../../../../lib/google/oauth.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const session = readSession(req);
  if (!session || !canAccess(session, 'toki')) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const status = googleStatus();
  if (status.state !== 'configured') return Response.json(status, { status: 409 });
  const nonce = crypto.randomBytes(16).toString('base64url');
  const state = signOAuthState({ nonce, exp: Date.now() + 10 * 60 * 1000, role: session.role }, process.env.DASHBOARD_SESSION_SECRET);
  const url = buildGoogleAuthorizeUrl({
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
    state,
  });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return Response.json({ ok: true, url }, {
    headers: {
      'cache-control': 'private, no-store',
      'set-cookie': `google_oauth_state=${state}; HttpOnly; Path=/api/cockpit/google; SameSite=Lax; Max-Age=600${secure}`,
    },
  });
}
