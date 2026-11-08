import { supabaseServer } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import ThemeToggle from "@/components/ThemeToggle";
import SignOut from "@/components/SignOut";
import SoraConversations from "@/components/SoraConversations";
import { parseConversation, SORA_PAGE } from "@/lib/sora";

export const dynamic = "force-dynamic";

export default async function SoraPage() {
  const db = await supabaseServer();
  const { data, error } = await db
    .from("sora_conversation")
    .select("id,started_at,ended_at,trigger,summary,transcript,actions")
    .order("started_at", { ascending: false })
    .limit(SORA_PAGE);

  const initial = (data ?? []).map((row) => parseConversation(row as Record<string, unknown>));
  const loadError = error?.message ?? null;

  return (
    <>
      <div className="aura" aria-hidden />
      <div className="app">
        <Sidebar />
        <main className="main">
          <div className="head">
            <div>
              <h1>Sora</h1>
              <div className="period">Every ask, and what she did</div>
            </div>
            <div className="head-actions"><SignOut /><ThemeToggle /></div>
          </div>

          <SoraConversations
            initial={initial}
            initialHasMore={initial.length === SORA_PAGE}
            loadError={loadError}
          />
        </main>
      </div>
    </>
  );
}
