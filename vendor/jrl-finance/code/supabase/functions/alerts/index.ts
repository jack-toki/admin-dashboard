// Sora alerts inbox.
//   action "create"  (default) any system reports a failure  -> x-ingest-key OR x-assistant-key
//   action "next"    Sora asks for the next alert to announce -> x-assistant-key
//   action "mark"    Sora updates status / retry timing        -> x-assistant-key
//   action "list"    open alerts                               -> x-assistant-key
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const INGEST_KEY = Deno.env.get("ALERT_INGEST_KEY");
const SORA_KEY = Deno.env.get("SORA_ALERTS_KEY");
const DEDUPE_HOURS = 6;
const SEVERITIES = ["critical", "error", "info"];
const STATUSES = ["open", "pushed", "acknowledged", "resolved"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const isUuid = (s: unknown) =>
  typeof s === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const str = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

// deno-lint-ignore no-explicit-any
async function create(b: any) {
  const source = str(b.source, 100);
  const title = str(b.title, 300);
  if (!source || !title) return json({ error: "source and title are required" }, 400);
  const severity = b.severity ?? "error";
  if (!SEVERITIES.includes(severity)) {
    return json({ error: "severity must be critical, error or info" }, 400);
  }
  const detail = str(b.detail, 4000);
  const context = b.context && typeof b.context === "object" ? b.context : null;

  // Merge repeats of the same failure instead of nagging
  const since = new Date(Date.now() - DEDUPE_HOURS * 3600_000).toISOString();
  const { data: existing, error: findErr } = await supabase
    .from("sora_alerts")
    .select("id, occurrences")
    .eq("source", source)
    .eq("title", title)
    .neq("status", "resolved")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findErr) return json({ error: findErr.message }, 500);

  if (existing) {
    const { error } = await supabase
      .from("sora_alerts")
      .update({
        occurrences: existing.occurrences + 1,
        last_seen_at: new Date().toISOString(),
        ...(detail ? { detail } : {}),
      })
      .eq("id", existing.id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, id: existing.id, deduped: true });
  }

  const { data, error } = await supabase
    .from("sora_alerts")
    .insert({ source, title, severity, detail, context })
    .select("id")
    .single();
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, id: data.id }, 201);
}

async function next() {
  // Only critical/error interrupt; info waits for a summary
  const { data, error } = await supabase
    .from("sora_alerts")
    .select("*")
    .eq("status", "open")
    .in("severity", ["critical", "error"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("severity", { ascending: true }) // 'critical' sorts before 'error'
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, alert: data });
}

// deno-lint-ignore no-explicit-any
async function mark(b: any) {
  if (!isUuid(b.id)) return json({ error: "valid id is required" }, 400);
  const now = new Date().toISOString();
  // deno-lint-ignore no-explicit-any
  const patch: Record<string, any> = {};

  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) return json({ error: "invalid status" }, 400);
    patch.status = b.status;
    if (b.status === "acknowledged") patch.acknowledged_at = now;
    if (b.status === "resolved") patch.resolved_at = now;
  }
  if (b.attempts !== undefined) {
    if (!Number.isInteger(b.attempts) || b.attempts < 0) {
      return json({ error: "attempts must be a whole number" }, 400);
    }
    patch.attempts = b.attempts;
  }
  if (b.next_attempt_at !== undefined) {
    if (typeof b.next_attempt_at !== "string" || isNaN(Date.parse(b.next_attempt_at))) {
      return json({ error: "next_attempt_at must be an ISO date" }, 400);
    }
    patch.next_attempt_at = b.next_attempt_at;
  }
  if (b.pushed === true) patch.pushed_at = now;
  if (Object.keys(patch).length === 0) return json({ error: "nothing to update" }, 400);

  const { data, error } = await supabase
    .from("sora_alerts")
    .update(patch)
    .eq("id", b.id)
    .select("id, status, attempts, next_attempt_at")
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: "not found" }, 404);
  return json({ ok: true, alert: data });
}

async function list() {
  const { data, error } = await supabase
    .from("sora_alerts")
    .select("id, created_at, source, severity, title, occurrences, status")
    .neq("status", "resolved")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, alerts: data });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  const action = body.action ?? "create";
  const soraOk = !!SORA_KEY && req.headers.get("x-assistant-key") === SORA_KEY;
  const ingestOk = !!INGEST_KEY && req.headers.get("x-ingest-key") === INGEST_KEY;

  if (action === "create") {
    if (!soraOk && !ingestOk) return json({ error: "unauthorised" }, 401);
    return create(body);
  }
  if (!soraOk) return json({ error: "unauthorised" }, 401);
  switch (action) {
    case "next": return next();
    case "mark": return mark(body);
    case "list": return list();
    default: return json({ error: "action must be create, next, mark or list" }, 400);
  }
});
