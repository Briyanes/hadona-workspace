/**
 * Diagnose: grup chat berhasil dibuat tapi TIDAK muncul di sidebar
 * Hipotesis: RLS members_insert (auth.uid() = user_id) memblok batch insert
 * (owner + member lain) → membership kosong → GET filter menyembunyikan grup private.
 *
 * Cek:
 * [1] Semua channel type='group' + jumlah member-nya
 * [2] Grup private yang TIDAK punya membership sama sekali (bug confirm)
 * [3] Policy members_insert yang aktif sekarang
 */
import { createClient } from "@supabase/supabase-js";
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
  console.log("══ [1] Channel type='group' + membership ══");
  const { data: groups, error: gErr } = await supabase
    .from("chat_channels")
    .select("id, name, type, is_private, created_by, created_at")
    .eq("type", "group")
    .order("created_at", { ascending: false })
    .limit(20);

  if (gErr) {
    console.log(`❌ Gagal query chat_channels: ${gErr.message}`);
    return;
  }
  if (!groups?.length) {
    console.log("(tidak ada channel group sama sekali)");
    return;
  }

  const { data: members } = await supabase
    .from("chat_channel_members")
    .select("channel_id, user_id, role");

  const memberCount = {};
  for (const m of members || []) {
    memberCount[m.channel_id] = (memberCount[m.channel_id] || 0) + 1;
  }

  let broken = 0;
  for (const g of groups) {
    const cnt = memberCount[g.id] || 0;
    const isBroken = g.is_private && cnt === 0;
    if (isBroken) broken++;
    console.log(
      `${isBroken ? "❌" : "✅"} ${g.name.slice(0, 30).padEnd(32)} private=${g.is_private} members=${cnt} created=${g.created_at?.slice(0, 16)}`
    );
  }

  console.log(`\n>>> ${broken} grup private dengan 0 member (tidak akan pernah muncul di sidebar siapa pun)`);

  console.log("\n══ [2] Policy chat_channel_members aktif ══");
  const { data: policies } = await supabase
    .from("pg_policies")
    .select("policyname, cmd, qual, with_check")
    .eq("tablename", "chat_channel_members");
  for (const p of policies || []) {
    console.log(`• ${p.policyname} (${p.cmd})`);
    if (p.cmd === "INSERT") console.log(`    with_check: ${p.with_check}`);
  }

  console.log("\n══ [3] Kesimpulan ══");
  if (broken > 0) {
    console.log("BUG TERKONFIRMASI: grup dibuat tapi membership batch insert gagal total karena RLS.");
    console.log("Fix: migration v93 (RLS creator boleh insert anggota + backfill owner) + route fix.");
  } else {
    console.log("Semua grup punya member — penyebab mungkin lain (cek filter GET / cache UI).");
  }
}

main();
