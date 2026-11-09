'use client';
import { useEffect, useState } from 'react';
import { safeCockpitReturn } from '../../../lib/jrl/return';
import '../jrl.css';

export default function LoginForm() {
  const [mode, setMode] = useState('password');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch('/api/cockpit/login').then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (body.mode === 'pin') setMode('pin');
    }).catch(() => {});
  }, []);

  async function submit(body) {
    setError('');
    setPending(true);
    try {
      const res = await fetch('/api/cockpit/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 503) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error === 'password_verifier_malformed'
          ? 'The password verifier is set but unreadable. The plaintext password was not used.'
          : 'Sign-in is not configured. The server needs DASHBOARD_SESSION_SECRET and either a code or the existing password.');
        return;
      }
      if (res.status === 429) {
        setError('Too many attempts. Wait and try again.');
        setPin('');
        return;
      }
      if (!res.ok) {
        setError(mode === 'pin' ? 'That code was not accepted.' : 'That password was not accepted.');
        setPin('');
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

  function enterDigit(digit) {
    if (pending) return;
    const next = `${pin}${digit}`.slice(0, 4);
    setPin(next);
    if (next.length === 4) submit({ pin: next });
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (mode === 'pin') {
      if (pin.length === 4) submit({ pin });
      return;
    }
    const entered = event.currentTarget.elements.password?.value ?? password;
    submit({ password: entered });
  }

  return (
    <div className="jrl-root">
      <div className="aura" aria-hidden="true" />
      <main className="login-wrap">
        <form className="panel glass login-card" method="post" action="/cockpit/login" onSubmit={onSubmit}>
          <h1>Cockpit sign-in</h1>
          <p className="sub">{mode === 'pin' ? 'Enter the 4-digit code.' : 'This password is not the personal Supabase sign-in. The public site is unchanged.'}</p>
          {mode === 'pin' ? (
            <div className="pin-pad">
              <p className="pin-dots" aria-live="polite">{pin.replace(/./g, '•')}{pin.length < 4 ? '◦'.repeat(4 - pin.length) : ''}</p>
              <input id="pin" name="pin" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={4} value={pin} aria-label="4-digit code" aria-invalid={error ? 'true' : 'false'} aria-describedby="login-error" onChange={(event) => {
                const next = event.target.value.replace(/\D/g, '').slice(0, 4);
                setPin(next);
                if (next.length === 4) submit({ pin: next });
              }} />
              <div className="pin-keys" role="group" aria-label="Numeric keypad">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((digit) => (
                  <button key={digit} type="button" onClick={() => enterDigit(digit)}>{digit}</button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <label className="entry-row" htmlFor="password"><span>Password</span></label>
              <span className="entry-input login-input"><input id="password" name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" aria-invalid={error ? 'true' : 'false'} aria-describedby="login-error" /></span>
            </>
          )}
          <p id="login-error" role="alert" className="entry-err">{error}</p>
          <button className="btn" type="submit" disabled={pending} aria-busy={pending}>{pending ? 'Signing in…' : 'Continue'}</button>
          {mode === 'pin' ? <button type="button" className="btn btn-ghost" onClick={() => setMode('password')}>Use password</button> : null}
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
