'use client';
import { useState } from 'react';
import { safeCockpitReturn } from '../../../lib/jrl/return';
import '../jrl.css';

export default function LoginForm() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    const entered = event.currentTarget.elements.password?.value ?? password;
    setError('');
    setPending(true);
    try {
      const res = await fetch('/api/cockpit/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: entered }),
      });
      if (res.status === 503) {
        const body = await res.json().catch(() => ({}));
        setError(body.error === 'password_verifier_malformed'
          ? 'The password verifier is set but unreadable. The plaintext password was not used.'
          : 'Sign-in is not configured. The server needs DASHBOARD_SESSION_SECRET and either DASHBOARD_PASSWORD_HASH or DASHBOARD_PASSWORD.');
        return;
      }
      if (res.status === 429) {
        setError('Too many attempts. Wait a few minutes and try again.');
        return;
      }
      if (!res.ok) {
        setError('That password was not accepted.');
        return;
      }
      const params = new URLSearchParams(window.location.search);
      window.location.assign(safeCockpitReturn(params.get('return') || '/cockpit'));
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
        <form className="panel glass login-card" method="post" action="/cockpit/login" onSubmit={onSubmit}>
          <h1>Cockpit sign-in</h1>
          <p className="sub">This password is not the personal Supabase sign-in. The public site is unchanged.</p>
          <label className="entry-row" htmlFor="password"><span>Password</span></label>
          <span className="entry-input login-input"><input id="password" name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" aria-invalid={error ? 'true' : 'false'} aria-describedby="login-error" /></span>
          <p id="login-error" role="alert" className="entry-err">{error}</p>
          <button className="btn" type="submit" disabled={pending} aria-busy={pending}>{pending ? 'Signing in…' : 'Continue'}</button>
        </form>
      </main>
    </div>
  );
}

const shell = { minHeight: '100vh', background: 'linear-gradient(158deg,#d6e2f1 0%,#e8e7f2 46%,#d9ece1 100%)', display: 'grid', placeItems: 'center', fontFamily: "'Inter',ui-sans-serif,system-ui,sans-serif", color: '#181b24', padding: 24 };
const card = { width: 'min(420px, 100%)', background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(20,24,40,0.07)', borderRadius: 16, padding: 24 };
const kicker = { letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 12, margin: 0, color: '#6b7280' };
const title = { fontSize: 28, fontWeight: 700, margin: '8px 0' };
const copy = { color: '#6b7280', lineHeight: 1.5 };
const label = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 };
const input = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(20,24,40,0.07)', borderRadius: 9, padding: '10px 12px', font: 'inherit', background: '#fff' };
const button = { marginTop: 16, background: '#fff', color: '#181b24', border: '1px solid rgba(20,24,40,0.07)', borderRadius: 9, boxShadow: '0 1px 2px rgba(0,0,0,.08)', padding: '10px 14px', font: 'inherit', fontWeight: 600, cursor: 'pointer' };
const alert = { color: '#9a3412' };
