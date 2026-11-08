import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '../../lib/auth';
import App from './ui/App';

export const dynamic = 'force-dynamic';

export default function CockpitPage() {
  const session = verifySession(cookies().get('toki_cockpit_session')?.value);
  if (!session) redirect('/cockpit/login');
  return <App role={session.role} areas={session.areas || []} client={session.client || null} />;
}
