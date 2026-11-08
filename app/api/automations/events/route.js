import { eventsPost } from '../../../../lib/cockpit/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(req) {
  return eventsPost(req);
}
