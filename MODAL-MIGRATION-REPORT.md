# Modal Migration Report — Design System Consolidation

Tanggal: 2026-08-28
Scope: Konsolidasi seluruh modal aplikasi ke shared `Modal` component (`src/components/ui/modal.tsx`)

## 1. Latar Belakang

Audit menemukan 40+ implementasi modal duplicat dengan pola berbeda-beda:
- Ada yang inline (bukan portal) → terpotong oleh overflow parent
- Tidak ada focus trap yang konsisten
- Footer button kadang tidak terlihat di mobile (di luar viewport)
- Overlay scroll behavior tidak konsisten
- Duplikasi ~150-200 baris per modal

## 2. Shared Modal Component

`src/components/ui/modal.tsx` kini menjadi single source of truth:

| Fitur | Detail |
|---|---|
| Portal | Render via `createPortal` ke `document.body` — aman dari overflow/transform parent |
| Focus trap | Tab/Shift+Tab terkurung dalam modal; focus kembali ke trigger saat close |
| Keyboard | Esc untuk close |
| Mobile | Bottom-sheet style (`sm:` breakpoint), full-width, rounded-top |
| Sticky footer | Aman dengan `env(safe-area-inset-bottom)` |
| Scroll | Body scrollable (`flex-1 overflow-y-auto`), max-height `dvh` |
| Title/Subtitle | Menerima `ReactNode` — konsisten |
| Size | `sm/md/lg/xl/full` |

## 3. Yang Dimigrasi (Commits)

| Commit | Scope |
|---|---|
| `06989a4` | Modal: render portal + centered layout + mobile footer buttons |
| `5589ce9` | Content-studio modals + mobile-first form grids |
| `c8b451c` | Task modals (create + detail) |
| `860052d` | Timesheet modal |
| `0ac47e8` | Leads & production modals |
| `90094c8` | Approvals & brand-kits modals |
| `c0d8297` | Security 2FA, communication-log, share-button (+fix null-safety shareUrl) |
| `7a7046d` | Calendar (5 modals), contract-manager, strategy wizard, client-content-tab |
| `b111e47` | Ads-spend (4 modals: spend-log, import-sheet, manual-token, ad-account) |
| `7ec9b85` | QA script: test-mobile-modal BASE_URL overridable |

**Total: ±44 modal dimigrasi**, net -750+ baris duplikasi.

## 4. Verifikasi

- ✅ `tsc --noEmit` clean
- ✅ `eslint` clean
- ✅ `next build` sukses (verifikasi per batch)
- ✅ Playwright `playwright-ads-spend-audit.mjs`: 4 PASS / 0 FAIL (layout-level; authenticated test membutuhkan kredensial QA yang tidak tersedia di environment)
- ⚠️ Authenticated Playwright modal test → jalankan manual:
  ```bash
  BASE_URL=http://localhost:3000 TEST_EMAIL=... TEST_PASSWORD=... node scripts/test-mobile-modal.mjs
  ```

## 5. Batch 8 (commit `74f2b58`)

9 file, net -64 baris — semua tsc/eslint PASS:

- `src/components/production/production-detail-modal.tsx`
- `src/components/strategy/strategy-detail-modal.tsx` + 2 modal inline di `src/app/(dashboard)/strategy/page.tsx`
- `src/app/(dashboard)/approvals/page.tsx` (review dialog → Modal)
- `src/app/(dashboard)/clients/[id]/page.tsx` (delete → ConfirmDialog)
- `src/app/(dashboard)/chat/page.tsx` (CreateGroup, InviteMember, NewDM → Modal)
- `src/components/reports/report-detail-modal.tsx` + `sheet-preview-modal.tsx` (konsistensi footer/size)
- `src/components/content-plans/import-sheet-modal.tsx` (konsistensi footer)

## 6. Modal yang Belum Dimigrasi (Technical Debt)

2 modal legacy tersisa — semuanya sudah mobile-safe (overlay scrollable + max-height) tetapi belum memakai shared Modal:

1. `src/components/reports/compare-view.tsx`
2. `src/components/monthly-reports/monthly-reports-manager.tsx` (inline modal)

## 7. Yang Masih Perlu Verifikasi Manual

1. Login sebagai tiap role → buka halaman ber-modal → pastikan fokus, Esc, dan footer button di mobile
2. Test bottom-sheet di iPhone dengan home indicator (safe-area)
3. Regression CRUD via modal: task create/edit, invoice, ads-spend log
4. Migration v99 (RLS drag-drop) sudah berjalan di production — verifikasi `scripts/verify-v99-deployed.mjs`