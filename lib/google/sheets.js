import crypto from 'crypto';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// The existing Google OAuth client in lib/google/oauth.js is spreadsheets.readonly
// and belongs to a user consent flow. Writes need a service account with the
// spreadsheets scope. This module does not publish the sheet.

export function serviceAccount(env = process.env) {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON || !env.FORECAST_SPREADSHEET_ID) return null;
  let parsed;
  try { parsed = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON); } catch { return null; }
  if (!parsed.client_email || !parsed.private_key) return null;
  return {
    email: String(parsed.client_email),
    key: String(parsed.private_key),
    spreadsheetId: String(env.FORECAST_SPREADSHEET_ID),
  };
}

export async function fetchServiceToken(account, fetchImpl = fetch) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim = Buffer.from(JSON.stringify({
    iss: account.email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })).toString('base64url');
  const unsigned = `${header}.${claim}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(account.key).toString('base64url');
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });
  if (!response?.ok) return null;
  const body = await response.json();
  return body.access_token || null;
}

function valuesUrl(spreadsheetId, range) {
  return `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
}

function cellText(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.round(value * 100) / 100);
  return String(value);
}

export async function readTabGrid(account, token, valueRenderOption, fetchImpl = fetch) {
  const range = "'Forecast Profit & Loss'!A1:AZ400";
  const response = await fetchImpl(`${valuesUrl(account.spreadsheetId, range)}?valueRenderOption=${encodeURIComponent(valueRenderOption)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response?.ok) return { ok: false, reason: 'sheet_unreadable', grid: [] };
  const body = await response.json();
  return { ok: true, grid: (body.values || []).map((row) => (row || []).map(cellText)) };
}

export async function readCell(account, token, a1, fetchImpl = fetch) {
  const range = `'Forecast Profit & Loss'!${a1}`;
  const response = await fetchImpl(valuesUrl(account.spreadsheetId, range), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response?.ok) return { ok: false, reason: 'sheet_unreadable' };
  const body = await response.json();
  const value = body.values?.[0]?.[0];
  return { ok: true, value: value == null ? '' : String(value) };
}

export async function writeCell(account, token, a1, value, fetchImpl = fetch) {
  const range = `'Forecast Profit & Loss'!${a1}`;
  const response = await fetchImpl(`${valuesUrl(account.spreadsheetId, range)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ range, values: [[value]] }),
  });
  if (!response?.ok) return { ok: false, reason: 'sheet_unwritable' };
  return { ok: true };
}
