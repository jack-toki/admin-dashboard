import { potGet, potPut } from '../../../../../lib/cockpit/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export function GET(req) {
  return potGet(req);
}

export function PUT(req) {
  return potPut(req);
}
