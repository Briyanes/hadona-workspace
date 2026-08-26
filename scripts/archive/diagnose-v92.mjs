/**
 * Diagnose v92: apakah CHECK constraint & policies BENAR-BENAR aktif di production?
 * - INSERT test type='group' via service role (bypass RLS, TAPI tetap kena CHECK constraint)
 * - Query pg_policies untuk chat_channels & chat_messages
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const envMap = Object.fromEntries(
  env.split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);

const supabase = createClient(envMap.NEXT_PUBLIC_SUPABASE_URL, envMap.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  console.log("══ [1] TEST INSERT type='group' (service role) ══");
  const testId = randomUUID();
  const { data: insertData, error: insertError } = await supabase
    .from("chat_channels")
    .insert({ id: testId, name: `__diag_group_${Date.now()}`, type: "group", is_private: false })
    .select("id, type")
    .single();

  if (insertError) {
    console.log("❌ INSERT GAGAL → constraint belum fix!");
    console.log(`   Code: ${insertError.code}`);
    console.log(`   Message: ${insertError.message}`);
    console.log(`   Detail: ${insertError.details || "-"}`);
    if (insertError.message.includes("chat_channels_type_check")) {
      console.log("\n>>> KESIMPULAN: migration v92 TIDAK diterapkan di DB production.");
      console.log(">>> SQL yang dijalankan user via Dashboard kemungkinan gagal & rollback total.");
    }
  } else {
    console.log(`✅ INSERT SUKSES (id=${insertData.id}, type=${insertData.type})`);
    console.log("→ CHECK constraint SUDAH mengizinkan 'group'. Bersihkan row test...");
    const { error: delError } = await supabase.from("chat_channels").delete().eq("id", testId);
    if (delError) console.log(`⚠️ Gagal hapus row test: ${delError.message} (hapus manual id=${testId})`);
    else console.log("✅ Row test dihapus");
  }

  console.log("\n══ [2] POLICIES aktif di chat_channels & chat_messages ══");
  const { data: policies, error: polError } = await supabase
    .from("pg_policies")
    .select("tablename, policyname, cmd")
    .in("tablename", ["chat_channels", "chat_messages", "chat_channel_members"]);
  if (polError) {
    console.log(`⚠️ Tidak bisa query pg_policies: ${polError.message}`);
  } else {
    for (const p of policies || []) {
      console.log(`• [${p.tablename}] ${p.policyname} (${p.cmd})`);
    }
    if (!policies?.length) console.log("(tidak ada policy ditemukan)");
  }

  console.log("\n══ [3] Seeded channels sekarang ══");
  const { data: channels } = await supabase
    .from("chat_channels")
    .select("id, name, type, is_private, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  for (const c of channels || []) {
    console.log(`• ${c.type.padEnd(12)} ${c.name.slice(0, 40)} (${c.created_at?.slice(0, 16)})`);
  }
}

main();