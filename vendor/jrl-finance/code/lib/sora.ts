export const SORA_PAGE = 30;

export type TranscriptRole = "jack" | "sora" | "system";

export interface TranscriptLine {
  role: TranscriptRole;
  text: string;
  at: string;
}

export interface SoraAction {
  tool: string;
  label: string;
  ok: boolean;
  input: unknown;
  result: string;
  at: string;
}

export interface SoraConversation {
  id: string;
  started_at: string;
  ended_at: string | null;
  trigger: string;
  summary: string;
  transcript: TranscriptLine[];
  actions: SoraAction[];
}

function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function parseTranscript(raw: unknown): TranscriptLine[] {
  return asArray(raw).map((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const role = str(row.role);
    return {
      role: role === "jack" || role === "sora" || role === "system" ? role : "system",
      text: str(row.text),
      at: str(row.at),
    };
  });
}

function parseActions(raw: unknown): SoraAction[] {
  return asArray(raw).map((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      tool: str(row.tool),
      label: str(row.label) || str(row.tool) || "Action",
      ok: row.ok !== false,
      input: row.input,
      result: typeof row.result === "string" ? row.result : JSON.stringify(row.result ?? ""),
      at: str(row.at),
    };
  });
}

export function parseConversation(row: Record<string, unknown>): SoraConversation {
  return {
    id: str(row.id),
    started_at: str(row.started_at),
    ended_at: row.ended_at == null ? null : str(row.ended_at),
    trigger: str(row.trigger),
    summary: str(row.summary) || "Untitled ask",
    transcript: parseTranscript(row.transcript),
    actions: parseActions(row.actions),
  };
}

export function triggerIcon(trigger: string): string {
  switch (trigger) {
    case "wake": return "🎙️";
    case "alert": return "🔔";
    case "keyboard": return "⌨️";
    case "phone": return "📱";
    default: return "💬";
  }
}

export function timeOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function dayHeading(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  const start = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  const diff = Math.round((start(now) - start(d)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export function groupByDay(rows: SoraConversation[]): { heading: string; rows: SoraConversation[] }[] {
  const groups: { heading: string; rows: SoraConversation[] }[] = [];
  for (const row of rows) {
    const heading = dayHeading(row.started_at);
    const last = groups[groups.length - 1];
    if (last && last.heading === heading) last.rows.push(row);
    else groups.push({ heading, rows: [row] });
  }
  return groups;
}
