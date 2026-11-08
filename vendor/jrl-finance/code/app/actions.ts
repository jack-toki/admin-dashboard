"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export interface SaveInput {
  period: string;            // 'YYYY-MM-01'
  taxIn: number;
  savingsIn: number;
  hlIn: number;
  savingsOut: number;
  hlValue: number | null;
}

export async function saveMonth(input: SaveInput) {
  const db = await supabaseServer();

  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false as const, error: "You're signed out — sign in and try again." };

  if (!/^\d{4}-\d{2}-01$/.test(input.period)) {
    return { ok: false as const, error: "That month doesn't look right." };
  }
  const nums = [input.taxIn, input.savingsIn, input.hlIn, input.savingsOut];
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) {
    return { ok: false as const, error: "Amounts can't be negative or blank." };
  }
  if (input.hlValue !== null && (!Number.isFinite(input.hlValue) || input.hlValue < 0)) {
    return { ok: false as const, error: "That HargLans ISA value doesn't look right." };
  }

  const { error } = await db.from("monthly_entry").upsert({
    period:             input.period,
    tax_in:             input.taxIn,
    savings_in:         input.savingsIn,
    hl_in:              input.hlIn,
    savings_out:        input.savingsOut,
    hl_portfolio_value: input.hlValue,
    source:             "dashboard",
  }, { onConflict: "period" });

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/");
  return { ok: true as const };
}

export async function signOut() {
  const db = await supabaseServer();
  await db.auth.signOut();
  revalidatePath("/");
}
