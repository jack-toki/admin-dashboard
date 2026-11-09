import { ratesGet, ratesPut } from '../../../../lib/cockpit/rates.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export function GET(req) {
  return ratesGet(req);
}

export function PUT(req) {
  return ratesPut(req);
}
