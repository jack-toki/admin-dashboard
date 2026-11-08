import { createClient } from '@supabase/supabase-js';

let _client;
let _stamp;
export function db(env = process.env) {
  const stamp = `${env.SUPABASE_URL}|${env.SUPABASE_SERVICE_KEY}`;
  if (!_client || _stamp !== stamp) {
    _client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });
    _stamp = stamp;
  }
  return _client;
}

// Map a URL slug (e.g. "house-to-home") to the display label used in the sheet
// and dashboard (e.g. "House to Home Surveys"). Set ACCOUNTS in env as JSON.
export function accountLabel(slug) {
  let map = {};
  try { map = JSON.parse(process.env.ACCOUNTS || '{}'); } catch { /* ignore */ }
  if (map[slug]) return map[slug];
  // Fallback: prettify the slug so an unmapped account still shows sensibly.
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
