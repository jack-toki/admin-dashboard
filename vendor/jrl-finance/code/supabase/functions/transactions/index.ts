// Sora -> JRL cockpit. Logs purchases into public.purchase (what the dashboard shows).
//   action "add"    (default) log a purchase
//   action "recent" list recent purchases
//   action "void"   undo one of Sora's own purchases (deletes the row so the cockpit stays accurate)
//   action "log_conversation"  save one Sora conversation (summary, transcript, actions) for the cockpit
//   action "budget"            month overview: purchases (need/want), monthly entries, settings, targets
//   action "research_save"     create/update a web research job (sora_research)
// Auth: x-assistant-key header must match the ASSISTANT_API_KEY secret.
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const ASSISTANT_KEY = Deno.env.get("ASSISTANT_API_KEY");
const LARGE_AMOUNT = Number(Deno.env.get("LARGE_AMOUNT_THRESHOLD") ?? 1000);
const SOURCE = "sora";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const round2 = (n: number) => Math.round(n * 100) / 100;
const isDate = (s: unknown) =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const isUuid = (s: unknown) =>
  typeof s === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// deno-lint-ignore no-explicit-any
async function add(b: any) {
  const item = typeof b.description === "string" ? b.description.trim() : "";
  if (!item) return json({ error: "description is required" }, 400);

  const quantity = b.quantity === undefined ? 1 : Number(b.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return json({ error: "quantity must be a whole number >= 1" }, 400);
  }

  let total: number;
  if (b.unit_amount !== undefined) total = Number(b.unit_amount) * quantity;
  else if (b.amount !== undefined) total = Number(b.amount);
  else return json({ error: "unit_amount or amount is required" }, 400);
  if (!Number.isFinite(total) || total < 0) {
    return json({ error: "amount must be a positive number" }, 400);
  }
  total = round2(total);

  const kind = b.kind ?? "want";
  if (kind !== "need" && kind !== "want") {
    return json({ error: "kind must be 'need' or 'want'" }, 400);
  }
  if (b.spent_on !== undefined && !isDate(b.spent_on)) {
    return json({ error: "spent_on must be YYYY-MM-DD" }, 400);
  }

  if (total >= LARGE_AMOUNT && b.confirm !== true) {
    return json({
      error: "confirmation_required",
      message: `£${total.toFixed(2)} is over the £${LARGE_AMOUNT} threshold. Ask the user to confirm, then resend with "confirm": true.`,
    }, 422);
  }

  const unitNote = quantity > 1 && b.unit_amount !== undefined
    ? ` (${quantity} × £${round2(Number(b.unit_amount)).toFixed(2)})`
    : quantity > 1 ? ` (×${quantity})` : "";

  const { data, error } = await supabase
    .from("purchase")
    .insert({
      description: `${item}${unitNote}`,
      amount: total,
      kind,
      ...(b.spent_on ? { spent_on: b.spent_on } : {}),
      source: SOURCE,
      raw_input: typeof b.raw_input === "string" ? b.raw_input.slice(0, 1000) : null,
    })
    .select("id, spent_on, description, amount, kind")
    .single();

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, purchase: data }, 201);
}

// deno-lint-ignore no-explicit-any
async function recent(b: any) {
  const limit = Math.min(Math.max(Number(b.limit) || 10, 1), 50);
  const { data, error } = await supabase
    .from("purchase")
    .select("id, spent_on, description, amount, kind, source")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, purchases: data });
}

// deno-lint-ignore no-explicit-any
async function voidPurchase(b: any) {
  if (!isUuid(b.id)) return json({ error: "valid id is required" }, 400);
  const { data, error } = await supabase
    .from("purchase")
    .delete()
    .eq("id", b.id)
    .eq("source", SOURCE)
    .select("id, description, amount")
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: "not found, or not something Sora logged" }, 404);
  return json({ ok: true, removed: data });
}

const TRIGGERS = ["wake", "alert", "keyboard", "phone"];
const isIso = (s: unknown) => typeof s === "string" && !isNaN(Date.parse(s));

// deno-lint-ignore no-explicit-any
async function logConversation(b: any) {
  if (!isIso(b.started_at) || !isIso(b.ended_at)) {
    return json({ error: "started_at and ended_at must be ISO dates" }, 400);
  }
  const transcript = Array.isArray(b.transcript) ? b.transcript.slice(0, 200) : [];
  const actions = Array.isArray(b.actions) ? b.actions.slice(0, 100) : [];
  if (JSON.stringify(transcript).length + JSON.stringify(actions).length > 500_000) {
    return json({ error: "log too large" }, 413);
  }
  const summary = typeof b.summary === "string" && b.summary.trim()
    ? b.summary.trim().slice(0, 300)
    : "Conversation with Sora";

  const { data, error } = await supabase
    .from("sora_conversation")
    .insert({
      started_at: b.started_at,
      ended_at: b.ended_at,
      trigger: TRIGGERS.includes(b.trigger) ? b.trigger : "wake",
      summary,
      transcript,
      actions,
    })
    .select("id")
    .single();
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, id: data.id }, 201);
}

// deno-lint-ignore no-explicit-any
async function budget(b: any) {
  const now = new Date();
  const month = typeof b.month === "string" && /^\d{4}-\d{2}$/.test(b.month)
    ? b.month
    : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

  const [purchases, entries, settings, targets] = await Promise.all([
    supabase.from("purchase").select("spent_on, description, amount, kind")
      .gte("spent_on", start).lt("spent_on", next).order("amount", { ascending: false }),
    supabase.from("monthly_entry")
      .select("period, tax_in, savings_in, hl_in, savings_out, hl_portfolio_value")
      .lt("period", next).order("period", { ascending: false }).limit(3),
    supabase.from("finance_setting").select("key, label, value"),
    supabase.from("finance_target")
      .select("name, target_amount, tracks, target_date, monthly_plan, scope").order("sort_order"),
  ]);
  const err = purchases.error || entries.error || settings.error || targets.error;
  if (err) return json({ error: err.message }, 500);

  const rows = purchases.data ?? [];
  const sum = (k?: string) =>
    Math.round(rows.filter((r) => !k || r.kind === k).reduce((a, r) => a + Number(r.amount), 0) * 100) / 100;
  return json({
    ok: true,
    month,
    purchases: {
      total: sum(), needs: sum("need"), wants: sum("want"), count: rows.length,
      biggest: rows.slice(0, 8),
    },
    monthly_entries: entries.data,
    settings: settings.data,
    targets: targets.data,
  });
}

// deno-lint-ignore no-explicit-any
async function researchSave(b: any) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof b.status === "string") patch.status = b.status;
  if (typeof b.summary === "string") patch.summary = b.summary.slice(0, 2000);
  if (b.result && typeof b.result === "object") patch.result = b.result;
  if (Number.isInteger(b.chosen_index)) patch.chosen_index = b.chosen_index;

  if (b.id) {
    if (!isUuid(b.id)) return json({ error: "invalid id" }, 400);
    const { error } = await supabase.from("sora_research").update(patch).eq("id", b.id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, id: b.id });
  }
  const query = typeof b.query === "string" ? b.query.trim().slice(0, 500) : "";
  if (!query) return json({ error: "query is required" }, 400);
  const { data, error } = await supabase.from("sora_research")
    .insert({ ...patch, query, kind: b.kind === "product" ? "product" : "general" })
    .select("id").single();
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, id: data.id }, 201);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!ASSISTANT_KEY || req.headers.get("x-assistant-key") !== ASSISTANT_KEY) {
    return json({ error: "unauthorised" }, 401);
  }

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  switch (body.action ?? "add") {
    case "add": return add(body);
    case "recent": return recent(body);
    case "void": return voidPurchase(body);
    case "log_conversation": return logConversation(body);
    case "budget": return budget(body);
    case "research_save": return researchSave(body);
    default: return json({ error: "unknown action" }, 400);
  }
});
