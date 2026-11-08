import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '../../../lib/auth';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const session = verifySession(cookies().get('toki_cockpit_session')?.value);
  if (session) redirect('/cockpit');
  return <LoginForm />;
}
