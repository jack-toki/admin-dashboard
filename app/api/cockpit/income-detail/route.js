import { incomeDetailDelete, incomeDetailGet, incomeDetailPost } from '../../../../lib/cockpit/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req) {
  return incomeDetailGet(req);
}

export function POST(req) {
  return incomeDetailPost(req);
}

export function DELETE(req) {
  return incomeDetailDelete(req);
}
