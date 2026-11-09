import { outstandingGet, outstandingPatch, outstandingPost } from '../../../../lib/cockpit/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export function GET(req) {
  return outstandingGet(req);
}

export function POST(req) {
  return outstandingPost(req);
}

export function PATCH(req) {
  return outstandingPatch(req);
}
