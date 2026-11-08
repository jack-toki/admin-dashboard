import { planGet, planPost } from '../../../../lib/cockpit/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req) {
  return planGet(req);
}

export function POST(req) {
  return planPost(req);
}
