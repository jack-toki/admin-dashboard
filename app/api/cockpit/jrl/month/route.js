import { jrlWrite } from '../../../../../lib/jrl/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(req) {
  return jrlWrite(req);
}
