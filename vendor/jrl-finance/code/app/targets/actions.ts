"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export interface TargetInput {
  id?: string;
  name: string;
  target_amount: number;
  tracks: "net" | "savings" | "tax" | "chase" | "hl";
  scope: "personal" | "business";
  target_date: string | null;
  monthly_plan: number | null;
  growth_rate: number;
}

export async function saveTarget(t: TargetInput) {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false as const, error: "You're signed out." };

  if (!t.name.trim()) return { ok: false as const, error: "Give it a name." };
  if (!Number.isFinite(t.target_amount) || t.target_amount <= 0) {
    return { ok: false as const, error: "The target needs to be more than zero." };
  }

  const row = {
    ...(t.id ? { id: t.id } : {}),
    name: t.name.trim(),
    target_amount: t.target_amount,
    tracks: t.tracks,
    scope: t.scope,
    target_date: t.target_date,
    monthly_plan: t.monthly_plan,
    growth_rate: t.growth_rate,
  };

  const { error } = t.id
    ? await db.from("finance_target").update(row).eq("id", t.id)
    : await db.from("finance_target").insert(row);

  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/targets");
  revalidatePath("/spending");
  revalidatePath("/");
  return { ok: true as const };
}

export async function deleteTarget(id: string) {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false as const, error: "You're signed out." };

  const { error } = await db.from("finance_target").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/targets");
  revalidatePath("/spending");
  revalidatePath("/");
  return { ok: true as const };
}
