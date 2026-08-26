import { chromium } from "playwright";
import fs from "fs";

const BASE_URL = "https://workspace.hadona.id";
const LOGIN_EMAIL = process.env.TEST_EMAIL;
const LOGIN_PASSWORD = process.env.TEST_PASSWORD;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "id-ID",
  });
  const page = await context.newPage();

  console.log("=== Login ===");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.fill('input[type="email"]', LOGIN_EMAIL);
  await page.fill('input[type="password"]', LOGIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);

  // Navigate to ads-spend
  await page.goto(`${BASE_URL}/ads-spend`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(3000);

  // Check client-side data via evaluate
  const clientData = await page.evaluate(async () => {
    // Try to read ad_spend_logs directly from client Supabase
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");

    const supabaseUrl = window.__NEXT_DATA__?.runtimeConfig?.NEXT_PUBLIC_SUPABASE_URL
      || document.querySelector('meta[name="supabase-url"]')?.content
      || "unknown";

    // Try to intercept the React state
    // Find React fiber root
    const root = document.getElementById("__next");
    if (!root) return { error: "No __next root" };

    // Check all table rows for spend data
    const rows = document.querySelectorAll("table tbody tr");
    const rowData = Array.from(rows).slice(0, 5).map(r => {
      const cells = r.querySelectorAll("td");
      return Array.from(cells).map(c => c.textContent?.trim().substring(0, 30));
    });

    // Check chart paths (recharts uses SVG paths)
    const allSvgs = document.querySelectorAll("svg");
    const chartSvgs = Array.from(allSvgs).filter(s => {
      const w = s.getBoundingClientRect().width;
      return w > 100; // Chart SVGs are large
    });

    const chartPaths = chartSvgs.map(svg => {
      const paths = svg.querySelectorAll("path");
      return {
        width: svg.getBoundingClientRect().width,
        height: svg.getBoundingClientRect().height,
        pathCount: paths.length,
        pathDs: Array.from(paths).slice(0, 3).map(p => p.getAttribute("d")?.substring(0, 80)),
      };
    });

    return { rowData, chartSvgs: chartPaths, supabaseUrl };
  });

  console.log("\n=== CLIENT DATA ===");
  console.log("Table rows (first 5):");
  clientData.rowData?.forEach((row, i) => {
    console.log(`  Row ${i}: ${JSON.stringify(row)}`);
  });

  console.log("\nChart SVGs (large):");
  clientData.chartSvgs?.forEach((svg, i) => {
    console.log(`  Chart ${i}: ${svg.width}x${svg.height}, ${svg.pathCount} paths`);
    svg.pathDs?.forEach((d, j) => console.log(`    Path ${j}: ${d}`));
  });

  // Now check via debug API to see if data exists in DB
  const cookies = await context.cookies();
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");

  console.log("\n=== DEBUG API CHECK ===");
  const debugRes = await fetch(`${BASE_URL}/api/debug/ads-spend`, {
    headers: { Cookie: cookieHeader },
  });
  const debugText = await debugRes.text();
  console.log("Debug status:", debugRes.status);
  console.log("Debug response (first 2000 chars):", debugText.substring(0, 2000));

  await browser.close();
}

main().catch(console.error);