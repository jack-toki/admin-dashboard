import { jrlGet } from '../../../../lib/jrl/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req) {
  return jrlGet(req);
}
