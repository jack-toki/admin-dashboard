import { createClient } from '@supabase/supabase-js';

let _client;
export function db() {
  if (!_client) {
    _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });
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
