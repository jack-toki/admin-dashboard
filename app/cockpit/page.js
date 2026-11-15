import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { previewAdminSession, signInRequired, verifySession } from '../../lib/auth';
import { previewFixtureEnabled } from '../../lib/cockpit/preview';
import App from './ui/App';

export const dynamic = 'force-dynamic';

export default function CockpitPage() {
  const session = verifySession(cookies().get('toki_cockpit_session')?.value) || (signInRequired() ? null : previewAdminSession());
  if (!session) redirect('/cockpit/login');
  return <App role={session.role} areas={session.areas || []} client={session.client || null} fixture={previewFixtureEnabled()} />;
}
