# Hadona Workspace — Agency Operating System

Internal platform untuk **Hadona Digital Media**. Menggabungkan Task Manager, Ads Spend Tracker, Weekly Reports, dan modul agency lainnya ke dalam satu web app modern. Didesain untuk di-integrate dengan WorkAdventure sebagai Virtual Office.

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14 (App Router) + TypeScript |
| **Styling** | Tailwind CSS (Custom Design System) |
| **Database & Auth** | Supabase (PostgreSQL + Realtime + Auth) |
| **Storage** | Cloudflare R2 (S3-Compatible) |
| **Hosting** | Vercel |
| **Virtual Office** | WorkAdventure (Iframe Integration) |

## 📋 Prasyarat

- Node.js 18+
- Akun Supabase (free tier OK)
- Akun Cloudflare R2
- Akun Vercel

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone <repo-url>
cd "Team Work Hadona"
npm install
```

### 2. Environment Variables

Copy `.env.example` ke `.env.local` dan isi:

```env
# App
NEXT_PUBLIC_APP_URL=https://teamwork.hadona.id

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx

# Cloudflare R2
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=hadona-workspace
R2_PUBLIC_URL=https://cdn.hadona.id
```

### 3. Setup Database

Jalankan SQL berikut di Supabase SQL Editor (urutan penting):

1. `supabase/schema.sql` — Membuat semua tabel + RLS policies
2. `supabase/seed-clients.sql` — Seed 37 data klien

### 4. Import Data dari Google Sheets (Optional)

Jika ingin import data historis dari Google Sheets:

```bash
# Set GOOGLE_SHEETS_API_KEY di .env.local
npx tsx src/scripts/import-google-sheets.ts
```

### 5. Run Development Server

```bash
npm run dev
```

Buka `http://localhost:3000`

## 🎮 WorkAdventure Integration

### Setup Iframe di Tiled Map Editor

1. Buka map Anda di [Tiled Map Editor](https://www.mapeditor.org/)
2. Tambahkan objek interaktif (rectangle/point) di posisi yang diinginkan
3. Tambahkan custom properties berikut:

| Property | Value |
|----------|-------|
| `openTab` | URL embed (lihat di bawah) |
| `active` | `true` |

### Embed URLs

```
# Dashboard (ringkasan stats)
https://teamwork.hadona.id/embed?token=USER_ACCESS_TOKEN

# Task List (tugas user)
https://teamwork.hadona.id/embed/tasks?token=USER_ACCESS_TOKEN
```

> **Catatan:** `USER_ACCESS_TOKEN` adalah Supabase JWT access token user.
> Generate via API route `/api/workadventure/token` (coming soon).

### Auth Flow untuk Embed

Middleware (`src/middleware.ts`) mengizinkan route `/embed/*` tanpa
cookie session. Sebagai gantinya, embed pages membaca token dari
URL search params (`?token=xxx`) dan menggunakannya untuk request
ke Supabase.

## 📁 Struktur Proyek

```
src/
├── app/
│   ├── (auth)/              # Login, signup pages
│   ├── (dashboard)/         # Main app (with sidebar + header)
│   │   ├── page.tsx         # Dashboard
│   │   ├── tasks/           # Kanban board
│   │   ├── ads-spend/       # Ads budget tracker
│   │   ├── reports/         # Weekly reports
│   │   ├── clients/         # Client directory
│   │   ├── strategy/        # OKR (placeholder)
│   │   ├── creative/        # Creative requests (placeholder)
│   │   ├── content-plans/   # Content calendar (placeholder)
│   │   └── settings/        # Settings + WorkAdventure config
│   └── embed/               # Iframe-optimized pages for WorkAdventure
├── components/
│   └── ui/                  # Sidebar, Header, reusable components
├── lib/
│   ├── supabase/            # Supabase client (browser + server)
│   ├── r2.ts                # Cloudflare R2 client
│   └── utils.ts             # Utilities (formatIDR, formatDate, etc.)
├── types/
│   ├── index.ts             # TypeScript interfaces
│   └── database.ts          # Supabase generated types
├── middleware.ts             # Auth guard + session refresh
└── scripts/
    └── import-google-sheets.ts
supabase/
├── schema.sql               # Full database schema + RLS
└── seed-clients.sql         # Seed data (37 clients)
```

## 🔐 Roles & Permissions (RLS)

| Role | Akses |
|------|-------|
| `super_admin` | Akses penuh ke semua data |
| `manager` | Lihat semua clients/tasks/reports, edit budget |
| `staff` | Lihat & edit tasks sendiri, lihat clients aktif |

RLS di-handle langsung di level database PostgreSQL via Supabase.

## 🎨 Design System

Color palette (dark-mode first):

| Token | Hex | Usage |
|-------|-----|-------|
| `background` | `#0F0F11` | Page background |
| `surface` | `#16161A` | Cards, sidebar |
| `primary` | `#6366F1` | Actions, links |
| `success` | `#22C55E` | Success states |
| `warning` | `#F59E0B` | Warnings |
| `danger` | `#EF4444` | Errors, overdue |
| `muted` | `#71717A` | Secondary text |

## 📦 Deployment ke Vercel

1. Push repository ke GitHub
2. Connect repo ke Vercel
3. Tambahkan semua environment variables di Vercel dashboard
4. Deploy

Domain akan otomatis ter-setup di `*.vercel.app`.
Hubungkan custom domain `teamwork.hadona.id` di Settings → Domains.

---

© 2025 Hadona Digital Media. Built with ❤️ for internal team.