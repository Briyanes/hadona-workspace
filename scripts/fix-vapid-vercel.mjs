import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const get = (k) =>
  (env.split("\n").find((l) => l.startsWith(k + "=")) || "")
    .split("=")
    .slice(1)
    .join("=")
    .trim()
    .replace(/^["']|["']$/g, "");

const PUB = get("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
const PRIV = get("VAPID_PRIVATE_KEY");

console.log("pub len:", PUB.length, "prefix:", PUB.slice(0, 8));
console.log("priv len:", PRIV.length);

const run = (cmd, input) => {
  execSync(cmd, { input, stdio: ["pipe", "ignore", "pipe"], timeout: 60000 });
};

for (const key of ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]) {
  try { run(`npx vercel env rm ${key} production -y`); } catch {}
}

run("npx vercel env add NEXT_PUBLIC_VAPID_PUBLIC_KEY production --type config", PUB);
console.log("✓ NEXT_PUBLIC_VAPID_PUBLIC_KEY ditambahkan (config)");
run("npx vercel env add VAPID_PRIVATE_KEY production --type config", PRIV);
console.log("✓ VAPID_PRIVATE_KEY ditambahkan (config)");