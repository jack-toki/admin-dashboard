import { pinCheck, pinSave, pinStatus } from '../../../../../lib/jrl/pinHttp.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export function GET(req) {
  return pinStatus(req);
}

export function PUT(req) {
  return pinSave(req);
}

export function POST(req) {
  return pinCheck(req);
}
