// ============================================
// HADONA WORKSPACE - GOOGLE SHEETS IMPORT SCRIPT
// Usage: npm run import:sheets
// Requires: SUPABASE_SERVICE_ROLE_KEY in .env.local
// ============================================

import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse";
import { parseIDR, parsePercent } from "@/lib/utils";

// ============================================
// CONFIGURATION
// ============================================
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// Google Sheet URLs (Published CSV format)
const SHEETS = {
  taskManager: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRxJxq-C1Sir4RkaLESmrtPuhciUPDm8dRGkWxh5YzIsnxJFfkG5jyd7RnzmU5DCHvY0eJIwVJJYkti/pub?output=csv&gid=1800927679",
  weeklyReport: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTbWYiTnXtz9ukLg-CprfY-fNCl3L-PbW-dWl-C8oMQAp-P6vJIN76zPhhk67FfBZi1TsRivogdpIp6/pub?output=csv&gid=779680986",
  adsSpend: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSrMQ3VuFWBGtfbf8P-EV2kGEv6GB2UnCqXSgUNiNh4aTXEQD7mECzrnnWsAeF7rllx6dOCIpKImTLR/pub?output=csv&gid=0",
};

// ============================================
// HELPERS
// ============================================
async function fetchCSV(url: string): Promise<string[][]> {
  console.log(`  📥 Fetching: ${url.substring(0, 60)}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  const text = await res.text();

  return new Promise((resolve, reject) => {
    parse(text, { relax_column_count: true, skip_empty_lines: true }, (err, records) => {
      if (err) reject(err);
      else resolve(records as string[][]);
    });
  });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseDate(dateStr: string): string | null {
  if (!dateStr || dateStr.trim() === "") return null;
  // Handle formats like "1 July 2026", "26 June 2026", "29/6/26"
  const cleaned = dateStr.trim();

  // Try DD/MM/YY format
  const dmyMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  // Try "1 July 2026" format
  const months: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
    july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
  };
  const longMatch = cleaned.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/i);
  if (longMatch) {
    const [, day, monthName, year] = longMatch;
    const month = months[monthName.toLowerCase()];
    if (month) return `${year}-${month}-${day.padStart(2, "0")}`;
  }

  return null;
}

function mapTaskStatus(status: string): string {
  const s = status?.toLowerCase().trim() || "";
  if (s === "done" || s === "completed" || s === "selesai") return "done";
  if (s === "in progress" || s === "ongoing" || s === "progress") return "in_progress";
  if (s === "review" || s === "cek") return "review";
  if (s === "blocked" || s === "hold" || s === "pending") return "blocked";
  return "todo";
}

function mapDivision(div: string): string | null {
  const d = div?.trim();
  if (!d) return null;
  if (/creative/i.test(d)) return "Creative Director";
  if (/advertis/i.test(d)) return "Advertiser";
  if (/account/i.test(d)) return "Account Executive";
  if (/design/i.test(d)) return "Designer";
  if (/copy/i.test(d)) return "Copywriter";
  if (/develop/i.test(d)) return "Developer";
  return d;
}

// ============================================
// GET USER & CLIENT MAPS
// ============================================
async function getMaps() {
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, email");
  const { data: clients } = await supabase.from("clients").select("id, name, slug");

  const userMap = new Map<string, string>();
  (profiles || []).forEach((p) => {
    const firstName = p.full_name.toLowerCase().split(" ")[0];
    userMap.set(firstName, p.id);
  });

  const clientMap = new Map<string, string>();
  (clients || []).forEach((c) => {
    clientMap.set(c.name.toLowerCase(), c.id);
    clientMap.set(c.slug, c.id);
  });

  return { userMap, clientMap };
}

// ============================================
// 1. IMPORT TASK MANAGER
// ============================================
async function importTaskManager(userMap: Map<string, string>, clientMap: Map<string, string>) {
  console.log("\n📋 Importing Task Manager...");
  const records = await fetchCSV(SHEETS.taskManager);
  if (records.length < 2) return console.log("  ⚠️ No data rows found");

  // Use a default admin user for created_by
  const defaultUserId = userMap.values().next().value;
  if (!defaultUserId) {
    console.log("  ⚠️ No users found. Skipping task import.");
    return;
  }

  let imported = 0;
  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    if (!row || row.length < 10) continue;

    const [, , divisi, pic, client, description, result, startDate, endDate, status] = row;
    if (!description?.trim()) continue;

    // Match client
    let clientId: string | null = null;
    if (client && client.trim().toUpperCase() !== "ALL CLIENT") {
      clientId = clientMap.get(client.trim().toLowerCase()) || null;
    }

    // Match PIC (assignees handled separately)
    const assigneeIds: string[] = [];
    if (pic) {
      pic.split(/[,/]/).forEach((name) => {
        const firstName = name.trim().toLowerCase().split(" ")[0];
        const uid = userMap.get(firstName);
        if (uid) assigneeIds.push(uid);
      });
    }

    const { data: task, error } = await supabase
      .from("tasks")
      .insert({
        client_id: clientId,
        title: description.trim().split("\n")[0].substring(0, 255),
        description: description.trim(),
        result: result?.trim() || null,
        status: mapTaskStatus(status),
        priority: "medium",
        division: mapDivision(divisi),
        start_date: parseDate(startDate),
        due_date: parseDate(endDate),
        created_by: defaultUserId,
      })
      .select("id")
      .single();

    if (error) {
      console.log(`  ❌ Row ${i}: ${error.message}`);
      continue;
    }

    // Insert assignees
    for (const uid of assigneeIds) {
      await supabase.from("task_assignees").insert({ task_id: task.id, user_id: uid });
    }

    imported++;
  }
  console.log(`  ✅ Imported ${imported} tasks`);
}

// ============================================
// 2. IMPORT WEEKLY REPORTS
// ============================================
async function importWeeklyReports(userMap: Map<string, string>, clientMap: Map<string, string>) {
  console.log("\n📊 Importing Weekly Reports...");
  const records = await fetchCSV(SHEETS.weeklyReport);
  if (records.length < 2) return console.log("  ⚠️ No data rows found");

  const defaultUserId = userMap.values().next().value;
  if (!defaultUserId) {
    console.log("  ⚠️ No users found. Skipping report import.");
    return;
  }

  let imported = 0;
  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    if (!row || row.length < 9) continue;

    const [inputDate, client, pic, , performance, result, conclusion, action] = row;
    if (!client?.trim()) continue;

    const clientId = clientMap.get(client.trim().toLowerCase());
    if (!clientId) {
      console.log(`  ⚠️ Client "${client}" not found in database, skipping`);
      continue;
    }

    const picId = pic ? userMap.get(pic.trim().toLowerCase()) : defaultUserId;
    const reportDate = parseDate(inputDate) || new Date().toISOString().split("T")[0];
    const periodEnd = new Date(reportDate);
    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - 7);

    const { data: report, error } = await supabase
      .from("weekly_reports")
      .insert({
        client_id: clientId,
        pic_id: picId || defaultUserId,
        period_start: periodStart.toISOString().split("T")[0],
        period_end: reportDate,
        summary: performance?.trim() || null,
        performance_text: result?.trim() || null,
        conclusion: conclusion?.trim() || null,
        action: action?.trim() || null,
        status: "reviewed",
      })
      .select("id")
      .single();

    if (error) {
      console.log(`  ❌ Row ${i}: ${error.message}`);
      continue;
    }

    // Parse and insert structured metrics from performance text
    const metrics: { metric_type: string; value: number | null }[] = [];
    const text = performance || "";

    const spend = text.match(/spend\s*:?\s*(rp|idr)?\s*([\d.,]+)/i);
    if (spend) metrics.push({ metric_type: "spend", value: parseIDR(spend[0]) });

    const cpr = text.match(/cost per result\s*:?\s*(rp|idr)?\s*([\d.,]+)/i);
    if (cpr) metrics.push({ metric_type: "cpr", value: parseIDR(cpr[0]) });

    const ctr = text.match(/ctr\s*:?\s*([\d.,]+)%/i);
    if (ctr) metrics.push({ metric_type: "ctr", value: parsePercent(ctr[0]) });

    const impressions = text.match(/impression[s]?\s*:?\s*([\d.,]+)/i);
    if (impressions) metrics.push({ metric_type: "impressions", value: parseIDR(impressions[0]) });

    const clicks = text.match(/click[s]?\s*:?\s*([\d.,]+)/i);
    if (clicks) metrics.push({ metric_type: "clicks", value: parseIDR(clicks[0]) });

    const purchase = text.match(/purchase\s*:?\s*([\d.,]+)/i);
    if (purchase) metrics.push({ metric_type: "purchase", value: parseIDR(purchase[0]) });

    const freq = text.match(/frequency\s*:?\s*([\d.,]+)/i);
    if (freq) metrics.push({ metric_type: "frequency", value: parsePercent(freq[0]) });

    for (const m of metrics) {
      if (m.value !== null) {
        await supabase.from("report_metrics").insert({
          weekly_report_id: report.id,
          metric_type: m.metric_type,
          value: m.value,
        });
      }
    }

    imported++;
  }
  console.log(`  ✅ Imported ${imported} weekly reports`);
}

// ============================================
// 3. IMPORT ADS SPEND CALCULATOR
// ============================================
async function importAdsSpend(clientMap: Map<string, string>) {
  console.log("\n💰 Importing Ads Spend Calculator...");
  const records = await fetchCSV(SHEETS.adsSpend);
  if (records.length < 2) return console.log("  ⚠️ No data rows found");

  let imported = 0;
  for (let i = 2; i < records.length; i++) {
    // Skip header row (index 0) and the "UPDATE" row (index 1)
    const row = records[i];
    if (!row || row.length < 6) continue;

    const [, client, platform, status, , , adAccountId, dailyBudget, remainingBudget, daysLeft, notes] = row;
    if (!client?.trim() || !platform?.trim()) continue;

    const clientId = clientMap.get(client.trim().toLowerCase());
    if (!clientId) {
      console.log(`  ⚠️ Client "${client}" not found, skipping`);
      continue;
    }

    const mapStatus = (s: string): string => {
      const st = s?.toLowerCase().trim() || "";
      if (st === "active") return "active";
      if (st === "hold") return "hold";
      return "inactive";
    };

    const { error } = await supabase.from("ad_accounts").insert({
      client_id: clientId,
      platform: platform.trim().toUpperCase(),
      ad_account_id: adAccountId?.trim() || `UNKNOWN-${i}`,
      objective: row[4]?.trim() || null,
      daily_budget: parseIDR(dailyBudget),
      remaining_budget: parseIDR(remainingBudget),
      days_left: daysLeft ? parseInt(daysLeft.replace(/[^0-9]/g, "")) || null : null,
      status: mapStatus(status),
      notes: notes?.trim() || null,
    });

    if (error) {
      console.log(`  ❌ Row ${i} (${client}): ${error.message}`);
      continue;
    }
    imported++;
  }
  console.log(`  ✅ Imported ${imported} ad accounts`);
}

// ============================================
// MAIN
// ============================================
async function main() {
  console.log("🚀 Hadona Workspace - Google Sheets Import");
  console.log("============================================");

  const { userMap, clientMap } = await getMaps();
  console.log(`Found ${userMap.size} users, ${clientMap.size} clients`);

  await importTaskManager(userMap, clientMap);
  await importWeeklyReports(userMap, clientMap);
  await importAdsSpend(clientMap);

  console.log("\n============================================");
  console.log("✅ Import complete!");
  console.log("============================================");
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});