// Diagnose web push: keypair validity + deployed bundle check
import { createECDH } from "node:crypto";
import { readFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const get = (k) =>
  (env.split("\n").find((l) => l.startsWith(k + "=")) || "")
    .split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

const PUB = get("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
const PRIV = get("VAPID_PRIVATE_KEY");

function b64uToBuf(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}
function bufToB64u(b) {
  return Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// 1. Derive public from private via ECDH (works without x/y in JWK)
try {
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(b64uToBuf(PRIV));
  const raw = ecdh.getPublicKey(); // uncompressed: 0x04 || x || y
  const derived = bufToB64u(raw);
  console.log("pub     :", PUB.slice(0, 24) + "...");
  console.log("derived :", derived.slice(0, 24) + "...");
  console.log("pub len :", PUB.length, "(expected 87)");
  console.log("keypair match:", derived === PUB ? "✅ YES" : "❌ NO — MISMATCH");
} catch (e) {
  console.log("❌ private key invalid:", e.message);
}

// 2. Check deployed bundle: use _buildManifest / app chunks via uncached fetch
const base = "https://hadona-workspace.vercel.app";
const html = await (await fetch(`${base}/settings/notifications?cb=${Date.now()}`, { redirect: "follow", headers: { "Cache-Control": "no-cache" } })).text();
const chunks = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]))];
console.log(`\nHTML ${html.length}B, ${chunks.length} chunks, contains login-page:`, html.includes("login") || html.includes("Masuk"));

const PUB_PREFIX = PUB.slice(0, 30);
let found = [];
for (const c of chunks) {
  try {
    const js = await (await fetch(base + c)).text();
    if (js.includes(PUB_PREFIX)) found.push(c.split("/").pop());
    // detect ANY 87-char b64url blob near "VAPID"
    const m = js.match(/[A-Za-z0-9_-]{80,95}/g) || [];
    const suspects = m.filter((s) => s.length === 87 && s.startsWith("B"));
    for (const s of suspects) if (s !== PUB) console.log("⚠ other 87-char key in", c.split("/").pop(), "→", s.slice(0, 20) + "...");
  } catch {}
}
console.log(found.length ? `✅ CORRECT key found in: ${found.join(", ")}` : "❌ correct key NOT in HTML chunks (may be in lazy-loaded client chunk)");