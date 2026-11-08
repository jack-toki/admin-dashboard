import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '../../../../lib/auth';
import { safeCockpitReturn } from '../../../../lib/jrl/return';
import JrlLoginForm from './JrlLoginForm';

export const dynamic = 'force-dynamic';

export default function JrlLoginPage({ searchParams }) {
  const session = verifySession(cookies().get('toki_cockpit_session')?.value);
  const back = safeCockpitReturn(searchParams?.return || '/cockpit#jrl');
  if (!session) {
    const again = `/cockpit/jrl/login?return=${encodeURIComponent(back)}`;
    redirect(`/cockpit/login?return=${encodeURIComponent(again)}`);
  }
  if (!session.areas?.includes('jrl')) redirect('/cockpit');
  return <JrlLoginForm returnTo={back} />;
}
