'use client';
import { useState } from 'react';

export default function LoginForm() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    const res = await fetch('/api/cockpit/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.status === 503) {
      setError('Sign-in is not configured. The server needs DASHBOARD_PASSWORD and DASHBOARD_SESSION_SECRET.');
      return;
    }
    if (!res.ok) {
      setError('That password was not accepted.');
      return;
    }
    window.location.href = '/cockpit';
  }

  return (
    <main style={shell}>
      <form onSubmit={onSubmit} style={card}>
        <p style={kicker}>Toki</p>
        <h1 style={title}>Cockpit sign-in</h1>
        <p style={copy}>Personal, business, and automation areas are behind this sign-in. The public site is unchanged.</p>
        <label htmlFor="password" style={label}>Password</label>
        <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" style={input} />
        {error && <p role="alert" style={alert}>{error}</p>}
        <button type="submit" style={button}>Continue</button>
      </form>
    </main>
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
