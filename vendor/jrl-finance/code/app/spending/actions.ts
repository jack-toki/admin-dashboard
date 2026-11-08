"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import type { Advice, Kind } from "@/lib/afford";

export async function logPurchase({
  description, amount, kind, advice,
}: {
  description: string;
  amount: number;
  kind: Kind;
  advice: Advice;
}) {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false as const, error: "You're signed out." };

  if (!description.trim()) return { ok: false as const, error: "What was it?" };
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false as const, error: "That amount doesn't look right." };
  }

  const today = new Date();
  const spent_on = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;

  const { error } = await db.from("purchase").insert({
    spent_on,
    description: description.trim(),
    amount,
    kind,
    advice,
  });

  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/spending");
  return { ok: true as const };
}

export async function deletePurchase(id: string) {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false as const, error: "You're signed out." };

  const { error } = await db.from("purchase").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/spending");
  return { ok: true as const };
}

export async function removePurchase(id: string): Promise<void> {
  await deletePurchase(id);
}

export async function saveSpendSettings({
  monthlyBudget, emergencyFloor, savingsFirst,
}: {
  monthlyBudget: number;
  emergencyFloor: number;
  savingsFirst: number;
}) {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false as const, error: "You're signed out." };

  const nums = [monthlyBudget, emergencyFloor, savingsFirst];
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) {
    return { ok: false as const, error: "Those numbers don't look right." };
  }

  const { error } = await db.from("finance_setting").upsert([
    { key: "monthly_budget",  value: monthlyBudget,  label: "Personal spending money each month" },
    { key: "emergency_floor", value: emergencyFloor, label: "The savings line never to go below" },
    { key: "savings_first",   value: savingsFirst,   label: "Saved every month before anything discretionary" },
  ], { onConflict: "key" });

  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/spending");
  return { ok: true as const };
}
