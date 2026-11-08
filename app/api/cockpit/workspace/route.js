import { workspaceGet } from '../../../../lib/cockpit/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req) {
  return workspaceGet(req);
}
