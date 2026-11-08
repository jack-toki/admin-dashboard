import { registerPost } from '../../../../lib/cockpit/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(req) {
  return registerPost(req);
}
