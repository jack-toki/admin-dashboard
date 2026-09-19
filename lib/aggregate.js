// Shared maths: turn logged runs + the profiles sheet into the dashboard shape.
// This is the same logic proven in zapier-runs.js, minus the Zapier fetch layer
// (runs now arrive by webhook), so when Zapier ships the real History API you
// only swap the data source, not this file.

export const CONFIG = {
  estMinutesPerRun: 7,
  hourlyRate: 50,
  currency: '£',
  savingsBasis: 'all', // webhook logs completed runs, so all of them count
  outcomeKeys: ['emailsSent', 'quotesSent', 'invoicesSent', 'documentsSent', 'leads', 'adminTasks'],
  parseInlineTags: true,
};

const TAG_ALIASES = {
  email: 'emailsSent', emails: 'emailsSent',
  quote: 'quotesSent', quotes: 'quotesSent',
  invoice: 'invoicesSent', invoices: 'invoicesSent',
  doc: 'documentsSent', document: 'documentsSent', documents: 'documentsSent', agreement: 'documentsSent',
  lead: 'leads', leads: 'leads',
};

// --- CSV -------------------------------------------------------------------
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((f) => f !== '')) rows.push(row); }
  return rows;
}

export function loadProfilesFromText(text, config = CONFIG) {
  const rows = parseCsv(text || '');
  if (rows.length < 2) return { byAccount: {}, byZapId: {} };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (names) => header.findIndex((h) => names.includes(h));
  const cAccount = col(['account', 'client']);
  const cTitle = col(['automation', 'title', 'zap', 'zap title', 'name']);
  const cZapId = col(['zapid', 'zap_id', 'zap id']);
  const cFor = {
    emailsSent: col(['emailssent', 'emails', 'email']),
    quotesSent: col(['quotessent', 'quotes', 'quote']),
    invoicesSent: col(['invoicessent', 'invoices', 'invoice']),
    documentsSent: col(['documentssent', 'documents', 'docs', 'agreements', 'pandadoc']),
    leads: col(['leads', 'lead']),
    adminTasks: col(['admin', 'autoadmin', 'auto-admin', 'auto admin', 'admintasks']),
  };
  const byAccount = {}, byZapId = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row.some((c) => String(c).trim())) continue;
    const counts = {};
    for (const k of config.outcomeKeys) counts[k] = cFor[k] !== -1 ? Number(row[cFor[k]]) || 0 : 0;
    const zapId = cZapId !== -1 ? String(row[cZapId] || '').trim() : '';
    if (zapId) byZapId[zapId] = counts;
    const account = cAccount !== -1 ? String(row[cAccount] || '').trim() : '';
    const title = cTitle !== -1 ? String(row[cTitle] || '').trim().toLowerCase() : '';
    if (account && title) (byAccount[account] ||= {})[title] = counts;
  }
  return { byAccount, byZapId };
}

// --- helpers ---------------------------------------------------------------
function cleanTitle(t) { return (t || '').replace(/\s*\[[^\]]*\]\s*/g, ' ').trim(); }

function countsFromObject(obj, config) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const key = TAG_ALIASES[String(k).toLowerCase()] || (config.outcomeKeys.includes(k) ? k : null);
    if (key) out[key] = (out[key] || 0) + Number(v || 0);
  }
  return Object.keys(out).length ? out : null;
}

function resolveProfile(run, config, clientProfiles, byZapId) {
  if (run.counts) { const c = countsFromObject(run.counts, config); if (c) return c; } // explicit payload wins
  if (byZapId && byZapId[String(run.zap_id)]) return byZapId[String(run.zap_id)];
  const lower = cleanTitle(run.zap_title).toLowerCase();
  if (clientProfiles) {
    if (clientProfiles[lower]) return clientProfiles[lower];
    const sub = Object.keys(clientProfiles).find((k) => lower && (lower.includes(k) || k.includes(lower)));
    if (sub) return clientProfiles[sub];
  }
  return null;
}

function dailyBuckets(runs) {
  const m = new Map();
  for (const r of runs) {
    const t = r.start_time; if (!t) continue;
    const day = String(t).slice(0, 10);
    m.set(day, (m.get(day) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, runs]) => runs);
}

function aggregateClient(client, runs, config, loaded, unprofiled) {
  const clientProfiles = loaded?.byAccount?.[client] || null;
  const out = {}; for (const k of config.outcomeKeys) out[k] = 0;
  const byTitle = new Map();
  for (const r of runs) {
    const key = cleanTitle(r.zap_title) || `Zap ${r.zap_id}`;
    byTitle.set(key, (byTitle.get(key) || 0) + 1);
    const p = resolveProfile(r, config, clientProfiles, loaded?.byZapId);
    if (!p) {
      const uk = `${client}::${key}`;
      const e = unprofiled.get(uk) || { client, title: key, zap_id: r.zap_id, runs: 0 };
      e.runs += 1; unprofiled.set(uk, e);
      continue;
    }
    for (const k of config.outcomeKeys) out[k] += p[k] || 0;
  }
  const mostRun = [...byTitle.entries()].sort((a, b) => b[1] - a[1])[0];
  const hours = (runs.length * config.estMinutesPerRun) / 60;
  return {
    client,
    automationsLive: new Set(runs.map((r) => r.zap_id)).size,
    runs: runs.length,
    estHoursSaved: Math.round(hours),
    estValueSaved: Math.round(hours * config.hourlyRate),
    usageTrend: dailyBuckets(runs),
    mostRunAutomation: mostRun ? { title: mostRun[0], count: mostRun[1] } : null,
    ...out,
  };
}

// rows: [{ account, zap_id, zap_title, ts, counts }]
export function buildDashboard(rows, sheetCsvText, period = {}) {
  const loaded = loadProfilesFromText(sheetCsvText, CONFIG);
  const byAccount = new Map();
  for (const row of rows) {
    const run = { zap_id: row.zap_id, zap_title: row.zap_title, start_time: row.ts, counts: row.counts };
    if (!byAccount.has(row.account)) byAccount.set(row.account, []);
    byAccount.get(row.account).push(run);
  }
  const unprofiled = new Map();
  const clients = [];
  for (const [account, runs] of byAccount) clients.push(aggregateClient(account, runs, CONFIG, loaded, unprofiled));
  clients.sort((a, b) => b.runs - a.runs);

  const sum = (k) => clients.reduce((t, c) => t + (c[k] || 0), 0);
  const totals = {
    clientAccounts: clients.length,
    automationsLive: sum('automationsLive'),
    runs: sum('runs'),
    estHoursSaved: sum('estHoursSaved'),
    estValueSaved: sum('estValueSaved'),
  };
  for (const k of CONFIG.outcomeKeys) totals[k] = sum(k);

  return {
    generatedAt: new Date().toISOString(),
    currency: CONFIG.currency,
    period,
    totals,
    clients,
    unprofiled: [...unprofiled.values()].sort((a, b) => b.runs - a.runs),
  };
}
