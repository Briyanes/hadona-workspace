#!/usr/bin/env node
/**
 * Fix CORS rules on Cloudflare R2 bucket.
 *
 * This allows the browser to PUT files directly to R2 via presigned URLs.
 * Without this, uploads fail with "Network error during upload" (CORS blocked).
 *
 * Usage:
 *   node scripts/fix-r2-cors.mjs
 *
 * Requires env vars (from .env.local):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 */

import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { config } from "dotenv";
import { Agent } from "https";

// Load .env.local
config({ path: ".env.local" });

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "hadona-workspace";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://workspace.hadona.id";

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error("❌ Missing R2 env vars. Check .env.local");
  process.exit(1);
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// CORS rules — allow browser uploads from our app
const corsRules = {
  CORSRules: [
    {
      AllowedOrigins: [
        APP_URL,
        "https://workspace.hadona.id",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ],
      AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
      AllowedHeaders: ["Content-Type", "Content-Length", "Authorization"],
      ExposeHeaders: ["ETag", "Content-Length"],
      MaxAgeSeconds: 3600,
    },
  ],
};

async function main() {
  console.log(`🔧 Setting CORS rules on R2 bucket: ${R2_BUCKET_NAME}`);
  console.log(`   Allowed origins: ${corsRules.CORSRules[0].AllowedOrigins.join(", ")}`);

  const cmd = new PutBucketCorsCommand({
    Bucket: R2_BUCKET_NAME,
    CORSConfiguration: corsRules,
  });

  await r2.send(cmd);
  console.log("✅ CORS rules applied successfully!");
  console.log("   Browser uploads to R2 will now work.");
}

main().catch((err) => {
  console.error("❌ Failed:", err.message || err);
  process.exit(1);
});