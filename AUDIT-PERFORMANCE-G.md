# OPSI G — Performance Optimization Report

> Date: 2026-08-25 | Bundle analyzer: `ANALYZE=true npm run build`
> Regression QA: `scripts/playwright-g5-regression.mjs` — **15 PASS / 0 FAIL**

## 1. Bundle Analysis (Baseline)

Top 3 route chunks terberat (gzip):

| Route | Before | After | Δ |
|---|---|---|---|
| `/ads-spend` | 292 kB | **187 kB** | **-36%** |
| `/reports` | 314 kB | **204 kB** | **-35%** |
| `/chat` | 236 kB | 236 kB | 0 (tech debt) |
| Shared JS | — | 87.8 kB | — |

> Update 2026-08-25 (verifikasi ulang): `/reports` kini **204 kB** setelah `SpendRevenueChart` (recharts) dan `CreativePerformanceTracker` di-load via `next/dynamic` + conditional mount. `date-fns` terkonfirmasi hanya dipakai di `/chat`, bukan `/reports`.

Penyebab utama: `recharts` + `date-fns` di-import statis di dalam chart & modal yang semuanya ter-mount saat page load.

## 2. Perubahan

### G2 — `SpendRevenueChart` reusable (`src/components/charts/spend-revenue-chart.tsx`)

- Chart baru terpisah dari page, props-driven (`data`, `height`).
- Di-integrasi ke `/ads-spend` via `next/dynamic` + `ssr: false`.
- Recharts kini hanya di-load saat chart section terlihat → -105 kB dari chunk ads-spend.

### G2b — Lazy-load & conditional mount

**`/ads-spend` (4 modals)** — di-import `dynamic()` dan hanya render saat `open === true`:
- `ImportSheetModal`
- `SpendLogModal`
- `AdAccountModal`
- `ManualTokenModal`

**`/reports` (6 komponen berat)**:
- `KpiBar`, `CompareView`, `CreativePerformanceTracker` → `dynamic()` + conditional mount per tab aktif.
- `GoalTracker`, `SheetPreviewModal`, `ReportDetailModal` → conditional mount saat dibuka.

### G2c — `/chat` (DITUNDA — tech debt)

Tidak di-refactor: `use-chat-realtime` harus aktif di mount untuk subscription Supabase realtime; lazy-load panel berisiko memutus notifikasi pesan masuk. Aman > agresif.

## 3. Verification

- `npm run build`: **PASS** (0 error).
- Playwright G5 regression (desktop 1440×900 + mobile 390×844):
  - Login, dashboard home, `/ads-spend`, `/reports` semua rendered, no error boundary.
  - Chart mount ✓ (lazy works), lazy section "Compare" mount ✓.
  - Console clean, network clean, no horizontal overflow mobile (0px).
  - 2 warning = keterbatasan heuristik locator test (bukan bug app).

## 4. Tech Debt Tersisa

1. `/chat` 236 kB — perlu restrukturisasi hook realtime agar panel bisa di-lazy tanpa memutus subscription. (`date-fns` satu-satunya dependency berat di sini.)
2. `/reports` 204 kB — sisa berat dari page component besar (~3.3k baris, tabel + filter + 6 tab); butuh pemecahan tab menjadi route terpisah. **Selesai:** ~~`recharts` masih masuk chunk `/reports`~~ — sudah dynamic via `SpendRevenueChart` & `CreativePerformanceTracker` (diverifikasi build 2026-08-25).

## 5. Cara Menjalankan Ulang

```bash
# Bundle analyze
ANALYZE=true npm run build && open .next/analyze/client.html

# Regression QA (server harus jalan di :3000)
npm run build && npm start &
node scripts/playwright-g5-regression.mjs