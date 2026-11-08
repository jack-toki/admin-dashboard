import { jrlView } from '../../../../lib/jrl/status';
import { readSession } from '../../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const session = readSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const result = jrlView(session);
  return Response.json(result.body, { status: result.status, headers: { 'cache-control': 'private, no-store' } });
}
