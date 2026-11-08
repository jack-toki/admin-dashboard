'use client';
import { useState } from 'react';
import '../../jrl.css';
import { safeCockpitReturn } from '../../../../lib/jrl/return';

export default function JrlLoginForm({ returnTo }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const next = safeCockpitReturn(returnTo || '/cockpit#jrl');

  async function onSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget.elements;
    const enteredEmail = form.email?.value ?? email;
    const enteredPassword = form.password?.value ?? password;
    setError('');
    setPending(true);
    try {
      const res = await fetch('/api/cockpit/jrl/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cockpit-link': '1' },
        body: JSON.stringify({ email: enteredEmail, password: enteredPassword }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setError('That email and password were not accepted.');
        return;
      }
      if (res.status === 429) {
        setError('Too many attempts. Wait a few minutes and try again.');
        return;
      }
      if (res.status === 503) {
        setError('JRL sign-in is not configured on this server yet.');
        return;
      }
      if (!res.ok || !body.ok) {
        setError('Sign-in did not complete. The ledger was not opened.');
        return;
      }
      window.location.assign(next);
    } catch {
      setError('Sign-in could not reach the server.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="jrl-root">
      <div className="aura" aria-hidden="true" />
      <main className="login-wrap">
        <form className="panel glass login-card" method="post" action="/cockpit/jrl/login" onSubmit={onSubmit}>
          <h1>JRL sign-in</h1>
          <p className="sub">This is the personal ledger account. The cockpit password does not open these figures, and the service role is not used.</p>
          <label className="entry-row" htmlFor="jrl-email"><span>Email</span></label>
          <span className="entry-input login-input"><input id="jrl-email" name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></span>
          <label className="entry-row" htmlFor="jrl-password"><span>Password</span></label>
          <span className="entry-input login-input"><input id="jrl-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={error ? 'true' : 'false'} aria-describedby="jrl-login-error" /></span>
          <p id="jrl-login-error" role="alert" className="entry-err">{error}</p>
          <button className="btn" type="submit" disabled={pending} aria-busy={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </main>
    </div>
  );
}
