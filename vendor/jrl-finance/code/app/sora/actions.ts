"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export async function deleteConversation(id: string) {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false as const, error: "You're signed out." };

  const { error } = await db.from("sora_conversation").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/sora");
  return { ok: true as const };
}
