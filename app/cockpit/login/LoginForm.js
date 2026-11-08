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

const shell = { minHeight: '100vh', background: '#f6f5f1', display: 'grid', placeItems: 'center', fontFamily: 'Inter, sans-serif', color: '#1c1917', padding: 24 };
const card = { width: 'min(420px, 100%)', background: '#fffdf8', border: '1.5px solid #1c1917', boxShadow: '4px 4px 0 #1c1917', padding: 24 };
const kicker = { letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: 12, margin: 0 };
const title = { fontFamily: '"Space Grotesk", Inter, sans-serif', fontSize: 36, margin: '8px 0' };
const copy = { color: '#44403c', lineHeight: 1.5 };
const label = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 };
const input = { width: '100%', boxSizing: 'border-box', border: '1.5px solid #1c1917', padding: '10px 12px', font: 'inherit', background: '#fff' };
const button = { marginTop: 16, background: '#eb4626', color: '#fffdf8', border: '1.5px solid #1c1917', boxShadow: '3px 3px 0 #1c1917', padding: '10px 14px', font: 'inherit', fontWeight: 700, cursor: 'pointer' };
const alert = { color: '#9a3412' };
