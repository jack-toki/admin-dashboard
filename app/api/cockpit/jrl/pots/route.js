import { potGet, potPut } from '../../../../../lib/cockpit/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req) {
  return potGet(req);
}

export function PUT(req) {
  return potPut(req);
}
