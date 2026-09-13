# 📋 AUDIT ALL-IN-ONE + BLUEPRINT SISTEM BOOKING SALON
> Tanggal: 9 Agustus 2026 · Mode: Opsi B (Audit fondasi Hadona Workspace + Blueprint modul booking salon)
> Tim virtual: Booking Domain Expert · Bug Hunter · Workflow Analyst · Front/Back-End Expert · Long-Term Architect

---

## BAGIAN 1 — RINGKASAN EKSEKUTIF

| Aspek | Kesimpulan |
|---|---|
| **Apakah sistem booking salon sudah ada?** | ❌ BELUM. Pencarian menyeluruh (`booking/appointment/stylist/salon/kapster`) = 0 hasil di seluruh codebase. |
| **Apakah fondasi ini layak dipakai bangun booking salon?** | ✅ YA, sangat layak. Auth, RLS, roles, kalender, notifikasi (push+in-app), approval workflow, invoice, soft-delete, audit trail — semua sudah matang. |
| **Skor kelayakan fondasi** | **8.5/10** — siap dijadikan backbone, dengan beberapa perbaikan wajib (lihat temuan). |
| **Estimasi effort modul booking** | Fase 1 (MVP booking): **2–4 minggu** · Fase 2 (pembayaran & loyalitas): 2–3 minggu · Fase 3 (multi-cabang): 3–4 minggu. |
| **Risiko terbesar** | (1) Domain agency vs salon perlu pemisahan role/data yang bersih; (2) beban Supabase Realtime saat traffic booking tinggi; (3) double-booking tanpa constraint DB. |

**Stack terverifikasi:** Next.js 14 (App Router) · TypeScript · Supabase (Postgres+RLS+Realtime) · Cloudflare R2 · Vercel · web-push · 109 migrasi terkontrol · CI + smoke test + 40+ skrip Playwright.

---

## BAGIAN 2 — TEMUAN BUG HUNTER (front → back, A sampai Z)

### 🔴 Kritis / High — wajib diperbaiki sebelum modul booking dibangun

| # | Temuan | Lokasi | Dampak |
|---|--------|--------|--------|
| H1 | **IDOR di PATCH/DELETE calendar event** — tidak ada validasi kepemilikan; user login mana pun bisa reschedule/cancel event orang lain via `event_id` | `src/app/api/calendar/events/route.ts` | Untuk salon: customer/stylist bisa membatalkan jadwal orang lain |
| H2 | **Notifikasi hanya ke 1 assignee** — `.single()` pada `task_assignees` padahal relasi many-to-many | `api/calendar/events/route.ts` L134, L254 | Stylist ke-2 tidak dapat notif reschedule/cancel |
| H3 | **JWT di URL query string (`/embed?token=`)** — token bocor ke server log, browser history, referrer | `src/app/embed/page.tsx` + middleware bypass `/embed/*` | Kredensial user tersebar di tempat yang tidak terkontrol |
| H4 | **Riwayat secret di git** — service_role JWT & password admin pernah ter-commit (SESI 6, commit `d06245a` hanya menghapus, tidak rotasi) | repo history | Siapa pun yang punya akses repo lama bisa membypass RLS |

### 🟠 Medium

| # | Temuan | Lokasi | Dampak |
|---|--------|--------|--------|
| M1 | Reschedule tidak menulis `activity_logs` (audit gap) | `api/calendar/events` | Perubahan jadwal tidak terlacak siapa pelaku |
| M2 | `end_datetime` default +60 menit hardcode — tidak menghormati durasi layanan | `api/calendar/events` L64 | Fondasi ini akan salah untuk booking bervariasi durasi |
| M3 | Google OAuth token diambil `.maybeSingle()` tanpa penanganan error eksplisit → sinkron gagal senyap | `api/calendar/events` L71-74 | Event "tersimpan" tapi tidak sinkron ke Google Calendar |
| M4 | Data besar di-fetch tanpa pagination di dashboard aggregate (`tasks.select(status, due_date)` full-scan) | `api/dashboard/route.ts` | Melambat seiring pertumbuhan riwayat booking |
| M5 | `catch {}` kosong pada notifikasi — kegagalan tidak terlihat sama sekali | `api/calendar/*` | Pushnotif gagal tanpa jejak |
| M6 | Tidak ada health endpoint `/api/health` (dikonfirmasi SESI 7) — monitoring uptime sulit | `src/app/api` | Uptime salon tak terpantau |

### 🟡 Low / Catatan arsitektur

- Skema migrasi bersifat **append-only 109 file** tanpa tool versioning (mis. `supabase db migrate`) — risiko drift antara lokal & produksi (MIGRATIONS.md sendiri mengakui: v98 = terakhir di-apply, tapi file sudah sampai v109).
- ` UserRole` di `types/index.ts` vs `ROLES` di `division-permissions.ts` duplikatif dan bisa drift.
- Middleware melakukan query `profiles` per-request non-cached — menambah latensi setiap navigasi.
- Timezone `Asia/Jakarta` hardcode di Google Calendar sync — masalah saat multi-region/cabang luar negeri.

### ✅ Yang sudah kuat (jangan dirombak)

- Auth guard + onboarding/approval flow di middleware (bagus untuk onboarding karyawan salon baru).
- CSRF middleware + sanitize (DOMPurify-style) + 2FA TOTP + security headers + rate limiting.
- RLS + `SECURITY DEFINER` hardening (v108–v109, dengan pelajaran plan-cache terdokumentasi).
- Soft delete, audit trail, backup script, cron auth fail-closed, push notif (web-push + relay via pg_net).
- 40+ skrip Playwright — budaya QA bagus, tinggal ditambah skenario booking.

---

## BAGIAN 3 — WORKFLOW ANALYST: POV SEMUA PIHAK

### 👤 POV Customer salon (yang akan dibangun)
Perjalanan ideal yang harus tersedia: **Lihat layanan → pilih stylist → pilih slot → konfirmasi → dapat notif & pengingat → datang → dilayani → bayar → rating → riwayat**.
Yang sudah tersedia dari fondasi: notifikasi, kalender, invoice, chat, approval. **Gap utama:** tidak ada slot availability engine, tidak ada reminder otomatis H-1/H-3 jam, tidak ada self-service customer (semua route butuh login staff).

### 🛡️ POV Admin (front desk / owner)
Fondasi approval (`/approvals`, `approval_status`) dan dashboard agregat sudah ada → tinggal dipetakan: booking masuk → approve/assign → monitor. **Gap:** antrian real-time, konflik slot, laporan okupansi stylist, manajemen jadwal shift.

### 💇 POV Karyawan/Stylist
Fondasi task board + assignment + timesheet + push notif hampir 1:1 dengan kebutuhan stylist (antrian customer = task). **Gap:** view "jadwal saya hari ini" mobile-first, ubah status layanan (menunggu → dikerjakan → selesai) dengan 1 tap.

### 🏢 POV Jangka panjang
- **Skalabilitas:** Postgres + RLS scale baik; Realtime perlu channel per-cabang agar tidak broadcast global.
- **Biaya:** Vercel + Supabase free/pro tier cukup untuk 1 cabang; growth path jelas.
- **Maintainability:** disiplin migrasi harus dijaga (lihat MIGRATIONS.md); tambah test E2E booking.
- **Multi-tenancy:** skema sekarang single-tenant → tambah `branch_id` sejak awal agar multi-cabang tidak perlu refactor besar.

---

## BAGIAN 4 — BLUEPRINT MODUL BOOKING SALON

### 4.1 Pemetaan konsep

| Konsep Salon | Padanan di Hadona | Aksi |
|---|---|---|
| Stylist | `profiles` + division baru `Stylist` | tambah enum |
| Layanan (potong, warna, dll) | — | tabel baru `services` |
| Customer | `clients` (dipisah via flag) | tabel baru `customers` lebih bersih |
| Booking | `calendar_events` + `tasks` | tabel baru `bookings` (jangan paksa reuse) |
| Approval admin | `approval_status` pattern | reuse pola |
| Invoice/pembayaran | `invoices` | extend `payment_method`, `paid_at` |
| Rating | — | tabel baru `booking_reviews` |

### 4.2 Skema database (migrasi `migration-v110-salon-booking.sql`)

```sql
-- ============ CORE ============
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text, phone text,
  timezone text not null default 'Asia/Jakarta',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete cascade,
  name text not null,
  category text not null default 'hair',        -- hair | nail | facial | spa | other
  duration_minutes int not null check (duration_minutes between 5 and 480),
  price numeric(12,2) not null check (price >= 0),
  buffer_minutes int not null default 0,        -- jeda pembersihan antar booking
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.stylist_services (
  stylist_id uuid references public.profiles(id) on delete cascade,
  service_id uuid references public.services(id) on delete cascade,
  primary key (stylist_id, service_id)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id),
  full_name text not null,
  phone text not null,                          -- kunci utama identifikasi di Indonesia
  email text,
  notes text,                                   -- alergi/preferensi
  total_visits int not null default 0,
  created_at timestamptz not null default now(),
  unique (phone, branch_id),
  deleted_at timestamptz                        -- ikuti pola soft-delete v74
);

-- Inti sistem: SATU tabel bookings dengan EXCLUDE constraint anti double-booking
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  customer_id uuid not null references public.customers(id),
  stylist_id uuid not null references public.profiles(id),
  service_id uuid not null references public.services(id),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','confirmed','checked_in','in_service','completed','cancelled','no_show')),
  source text not null default 'admin' check (source in ('admin','customer_walkin','customer_online')),
  notes text,
  price_locked numeric(12,2),                   -- harga saat booking (proteksi perubahan harga)
  cancelled_by uuid references public.profiles(id),
  cancel_reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint bookings_time_valid check (end_at > start_at)
);

-- 🔑 ANTI DOUBLE-BOOKING: butuh extension btree_gist
create extension if not exists btree_gist;
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    stylist_id with =,
    tstzrange(start_at, end_at) with &&
  ) where (status not in ('cancelled','no_show') and deleted_at is null);

create index bookings_branch_time_idx on public.bookings (branch_id, start_at desc);
create index bookings_stylist_time_idx on public.bookings (stylist_id, start_at desc);
create index bookings_customer_idx on public.bookings (customer_id);

-- ============ PENDUKUNG ============
create table public.stylist_schedules (           -- jam kerja & shift
  id uuid primary key default gen_random_uuid(),
  stylist_id uuid not null references public.profiles(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true
);

create table public.stylist_time_off (            -- cuti/izin
  id uuid primary key default gen_random_uuid(),
  stylist_id uuid not null references public.profiles(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text
);

create table public.booking_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- Reminder terjadwal (diproses cron)
create table public.booking_reminders (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  remind_at timestamptz not null,
  channel text not null default 'push' check (channel in ('push','wa','email')),
  sent_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','sent','failed','skipped'))
);
```

> **Kenapa EXCLUDE constraint, bukan cek aplikasi?** Cek aplikasi race-prone: dua request bersamaan bisa lolos. Constraint DB = atomic, mematikan double-booking di akar. Pelajaran langsung dari pola plan-cache/trigger di v108–v109: jangan taruh logika kritikal di tempat yang bisa drift — taruh di constraint.

### 4.3 State machine booking

```
pending ──(admin approve)──▶ confirmed ──(customer datang)──▶ checked_in
   │                            │                                │
   └──(admin tolak/auto-expire)▶ cancelled                   in_service
                                                                 │
                                             completed ◀─────────┘
confirmed ──(lewat H+1 tanpa kabar)──▶ no_show
```
Aturan transisi di-enforce via trigger `bookings_status_guard` (whitelist transisi + catat ke `activity_logs`).

### 4.4 API surface baru

| Endpoint | Method | Auth | Catatan |
|---|---|---|---|
| `/api/salon/services` | GET/POST/PATCH | admin | CRUD layanan |
| `/api/salon/availability` | GET | public | slot kosong per stylist/tanggal — **pure compute, cacheable** |
| `/api/salon/bookings` | GET/POST | admin/customer | POST = create booking (kena constraint overlap → 409 rapi) |
| `/api/salon/bookings/[id]` | PATCH | admin/stylist | reschedule (rerun overlap check), cancel |
| `/api/salon/bookings/[id]/check-in` | POST | admin/stylist | status → checked_in |
| `/api/salon/bookings/[id]/complete` | POST | stylist | status → completed + buat invoice otomatis |
| `/api/salon/stylists/[id]/schedule` | GET/PUT | admin | shift mingguan |
| `/api/cron/booking-reminders` | GET | CRON_SECRET | kirim reminder H-24jam & H-3jam, tandai no_show |

Semua route wajib: `getAuthenticatedUser` (kecuali availability cron yang pakai `verifyCronSecret`), CSRF middleware otomatis sudah melindungi mutasi.

### 4.5 Permission matrix (extend `division-permissions.ts`)

```
Divisi baru: "Stylist" | "Kasir" | "Salon Manager"
- Stylist: lihat & update booking miliknya sendiri (checked_in→in_service→completed)
- Kasir: check-in, invoice, pembayaran — TIDAK bisa ubah jadwal
- Salon Manager: full CRUD booking, assign stylist, laporan
- super_admin: semua
Customer (via portal publik nantinya): hanya create/cancel booking milik phone-nya
```

### 4.6 Engine availability (algoritme)

```
slots(tanggal, layanan, stylist?) =
  1. Ambil jam kerja stylist (stylist_schedules) ∩ jam operasional cabang
  2. Kurangi time-off (stylist_time_off)
  3. Kurangi booking aktif (status IN pending,confirmed,checked_in,in_service)
     + buffer_minutes layanan sebelum/sesudah
  4. Potong per interval slot (mis. 15 menit)
  5. Return slot dengan durasi layanan cukup
```
Implementasi sebagai **RPC Postgres (`get_available_slots`)** agar sekali round-trip dan konsisten dengan constraint overlap — bukan loop fetch di Node.

### 4.7 Rencana implementasi bertahap

| Fase | Scope | Durasi | Exit criteria |
|---|---|---|---|
| **0. Stabilisasi** | Fix H1–H4, tambah `/api/health`, rotasi secret | 3–5 hari | Skrip verify all-green, IDOR test gagal saat diserang |
| **1. MVP Booking** | Migrasi v110 + CRUD booking + availability RPC + kalender salon view + notifikasi | 2–4 minggu | E2E Playwright: buat→approve→layani→selesai tanpa double-booking (test paralel 2 request) |
| **2. Pembayaran & Loyalitas** | Invoice otomatis, review, reminder WA/push, laporan okupansi | 2–3 minggu | Reminder terkirim tepat waktu ≥99%, laporan harian akurat |
| **3. Multi-cabang & Portal Customer** | branch scoping penuh, booking online publik (OTP WA), PWA | 3–4 minggu | Customer booking sendiri tanpa bantuan admin, okupansi per cabang |

---

## BAGIAN 5 — REKOMENDASI PRIORITAS

### Segera (minggu ini)
1. 🔴 Patch IDOR calendar events (validasi ownership/role sebelum PATCH/DELETE).
2. 🔴 Rotasi service_role JWT + password admin (tuntutan SESI 6 yang belum dieksekusi).
3. 🟠 Ganti notifikasi `.single()` → loop semua assignee.
4. 🟠 Tambah `/api/health` + uptime monitor (UptimeRobot/BetterStack).

### Jangka pendek (bulan ini)
5. Jalankan migrasi v99–v109 yang belum ter-apply di produksi + rapikan ledger migrasi.
6. Tambahkan Playwright test untuk concurrency booking (2 request simultan).
7. Hapus token dari URL embed → gunakan postMessage handshake atau short-lived opaque token.

### Jangka panjang (kuartal ini)
8. Eksekusi Fase 1–3 blueprint di atas.
9. Adopsi `supabase db migrate` resmi agar drift tidak terulang.
10. Pertimbangkan WA API (Fonnte/Wablas/Meta Cloud API) untuk reminder — medium paling efektif untuk customer salon Indonesia.
11. Dashboard okupansi & revenue per stylist (recharts sudah tersedia).

---

## KESIMPULAN

Fondasi Hadona Workspace adalah **backbone yang matang dan battle-tested** (109 migrasi, insiden security terdokumentasi dan diperbaiki, budaya QA kuat). Modul booking salon **belum ada**, tapi semua prasyarat berat — auth, RLS, notifikasi, kalender, invoice, approval — sudah berdiri. Dengan memperbaiki 4 temuan kritis dan mengikuti blueprint 4 fase di atas, sistem ini **sanggup menjadi booking system salon yang andal**, dan arsitekturnya cukup luwes untuk multi-cabang dalam jangka panjang.

*Diaudit oleh: team ahli virtual — Booking Domain Expert, Bug Hunter (front→back), Workflow Analyst (POV customer/admin/stylist), dan Long-Term Architect.*