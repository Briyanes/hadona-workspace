# 🔐 Playwright Authenticated Audit Report

**Date:** 2026-08-11T20:46:04.383Z
**Base URL:** https://workspace.hadona.id
**Authenticated:** ✅ Yes (admin@hadona.id)

## 📊 Summary

| Metric | Count |
|---|---|
| ✅ Passed (OK) | 20 |
| ⚠️ Warnings | 2 |
| 🚧 Unimplemented | 3 |
| 💥 Crashes | 0 |
| **Total Routes** | **25** |
| **Avg Load Time** | 3898ms |
| **Total Errors** | 0 page errors, 2 console errors, 2 API failures |

## 📄 Route Status

| Route | Status | Load (ms) | HTTP | Console Errs | API Fails | Placeholders | H1 | Data | Issues |
|---|---|---|---|---|---|---|---|---|---|
| ⚠️ `/` Dashboard | warning | 5757 | 200 | 2 | 1 | 0 | ✅ | ❌ | 1 API failure(s); Slow load: 5.8s |
| ✅ `/tasks` Tasks | ok | 3096 | 200 | 0 | 0 | 0 | ✅ | ❌ | — |
| ✅ `/clients` Clients | ok | 4773 | 200 | 0 | 0 | 0 | ✅ | ✅ | — |
| ✅ `/ads-spend` Ads Spend | ok | 3859 | 200 | 0 | 0 | 0 | ✅ | ✅ | — |
| ✅ `/reports` Weekly Reports | ok | 4282 | 200 | 0 | 0 | 0 | ✅ | ✅ | — |
| ✅ `/strategy` Strategy (OKR) | ok | 2899 | 200 | 0 | 0 | 0 | ✅ | ✅ | — |
| ✅ `/creative` Creative Requests | ok | 3453 | 200 | 0 | 0 | 0 | ✅ | ✅ | — |
| ✅ `/content-plans` Content Plans | ok | 3517 | 200 | 0 | 0 | 0 | ✅ | ✅ | — |
| ⚠️ `/chat` Team Chat | warning | 6371 | 200 | 0 | 1 | 0 | ✅ | ❌ | 1 API failure(s); Slow load: 6.4s |
| ✅ `/calendar` Calendar | ok | 3613 | 200 | 0 | 0 | 0 | ✅ | ✅ | — |
| ✅ `/timesheet` Timesheet | ok | 3095 | 200 | 0 | 0 | 0 | ✅ | ✅ | — |
| ✅ `/invoices` Invoices | ok | 3311 | 200 | 0 | 0 | 0 | ✅ | ✅ | — |
| ✅ `/users` User Management | ok | 3850 | 200 | 0 | 0 | 0 | ✅ | ✅ | — |
| ✅ `/content-studio` Content Studio | ok | 3379 | 200 | 0 | 0 | 0 | ✅ | ✅ | — |
| ✅ `/leads` Leads (CRM) | ok | 3498 | 200 | 0 | 0 | 0 | ✅ | ✅ | — |
| ✅ `/approvals` Approvals | ok | 2995 | 200 | 0 | 0 | 0 | ✅ | ✅ | — |
| ✅ `/production` Production | ok | 3234 | 200 | 0 | 0 | 0 | ✅ | ✅ | — |
| ✅ `/brand-kits` Brand Kits | ok | 3977 | 200 | 0 | 0 | 0 | ✅ | ❌ | — |
| ✅ `/settings` Settings (Index) | ok | 5532 | 200 | 0 | 0 | 0 | ✅ | ✅ | Slow load: 5.5s |
| ✅ `/settings/profile` Settings → Profile | ok | 3878 | 200 | 0 | 0 | 0 | ✅ | ✅ | — |
| 🚧 `/settings/notifications` Settings → Notifications | unimplemented | 3641 | 200 | 0 | 0 | 1 | ✅ | ❌ | Placeholder: coming soon |
| ✅ `/settings/security` Settings → Security | ok | 4043 | 200 | 0 | 0 | 0 | ✅ | ✅ | — |
| ✅ `/settings/workspace` Settings → Workspace | ok | 3997 | 200 | 0 | 0 | 0 | ✅ | ❌ | — |
| 🚧 `/settings/preferences` Settings → Preferences | unimplemented | 4080 | 200 | 0 | 0 | 1 | ✅ | ✅ | Placeholder: Coming Soon |
| 🚧 `/settings/integrations` Settings → Integrations | unimplemented | 3325 | 200 | 0 | 0 | 1 | ✅ | ❌ | Placeholder: Coming Soon |

## 🔍 Detailed Findings

### Dashboard — `/`
**Status:** `warning` | **Load:** 5757ms | **HTTP:** 200

**Issues:**
- 1 API failure(s)
- Slow load: 5.8s

**Console Errors:**
- `TypeError: Cannot read properties of undefined (reading 'atRisk')
    at ea (https://workspace.hadona.id/_next/static/chunks/app/(dashboard)/page-74c6ff20188ae729.js:1:43167)
    at rE (https://workspace.hadona.id/_next/static/chunks/fd9d1056-b40f8d1b956f153a.js:1:40344)
    at l$ (https://workspace.hadona.id/_next/static/chunks/fd9d1056-b40f8d1b956f153a.js:1:59319)
    at iZ (https://workspace.hadona.id/_next/static/chunks/fd9d1056-b40f8d1b956f153a.js:1:117926)
    at ia (https://workspace.hadona.id/_next/static/chunks/fd9d1056-b40f8d1b956f153a.js:1:95165)
    at https://workspace.hadona.id/_next/static/chunks/fd9d1056-b40f8d1b956f153a.js:1:94987
    at il (https://workspace.hadona.id/_next/static/chunks/fd9d1056-b40f8d1b956f153a.js:1:94994)
    at oJ (https://workspace.hadona.id/_next/static/chunks/fd9d1056-b40f8d1b956f153a.js:1:92350)
    at oZ (https://workspace.hadona.id/_next/static/chunks/fd9d1056-b40f8d1b956f153a.js:1:91769)
    at MessagePort.M (https://workspace.hadona.id/_next/static/chunks/2117-1055e4609815263f.js:1:85059)`
- `Dashboard error: TypeError: Cannot read properties of undefined (reading 'atRisk')
    at ea (https://workspace.hadona.id/_next/static/chunks/app/(dashboard)/page-74c6ff20188ae729.js:1:43167)
    at rE (https://workspace.hadona.id/_next/static/chunks/fd9d1056-b40f8d1b956f153a.js:1:40344)
    at l$ (https://workspace.hadona.id/_next/static/chunks/fd9d1056-b40f8d1b956f153a.js:1:59319)
    at iZ (https://workspace.hadona.id/_next/static/chunks/fd9d1056-b40f8d1b956f153a.js:1:117926)
    at ia (https://workspace.hadona.id/_next/static/chunks/fd9d1056-b40f8d1b956f153a.js:1:95165)
    at https://workspace.hadona.id/_next/static/chunks/fd9d1056-b40f8d1b956f153a.js:1:94987
    at il (https://workspace.hadona.id/_next/static/chunks/fd9d1056-b40f8d1b956f153a.js:1:94994)
    at oJ (https://workspace.hadona.id/_next/static/chunks/fd9d1056-b40f8d1b956f153a.js:1:92350)
    at oZ (https://workspace.hadona.id/_next/static/chunks/fd9d1056-b40f8d1b956f153a.js:1:91769)
    at MessagePort.M (https://workspace.hadona.id/_next/static/chunks/2117-1055e4609815263f.js:1:85059)`

**API Failures:**
- `500 /api/dashboard/client-health`

**Content Preview:** `Lewati ke konten utama Hadona Workspace  OPERATIONAL  Dashboard Tasks Calendar Timesheet  CRM  Clients Leads Pipeline Invoices  PERFORMANCE  Ads Spend...`

---

### Team Chat — `/chat`
**Status:** `warning` | **Load:** 6371ms | **HTTP:** 200

**Issues:**
- 1 API failure(s)
- Slow load: 6.4s

**API Failures:**
- `401 /api/team`

**Content Preview:** `Lewati ke konten utama Hadona Workspace  OPERATIONAL  Dashboard Tasks Calendar Timesheet  CRM  Clients Leads Pipeline Invoices  PERFORMANCE  Ads Spend...`

---

### Settings → Notifications — `/settings/notifications`
**Status:** `unimplemented` | **Load:** 3641ms | **HTTP:** 200

**Issues:**
- Placeholder: coming soon

**Placeholder/Dead Text:**
- `coming soon`

**Content Preview:** `Lewati ke konten utama Hadona Workspace  OPERATIONAL  Dashboard Tasks Calendar Timesheet  CRM  Clients Leads Pipeline Invoices  PERFORMANCE  Ads Spend...`

---

### Settings → Preferences — `/settings/preferences`
**Status:** `unimplemented` | **Load:** 4080ms | **HTTP:** 200

**Issues:**
- Placeholder: Coming Soon

**Placeholder/Dead Text:**
- `Coming Soon`

**Content Preview:** `Lewati ke konten utama Hadona Workspace  OPERATIONAL  Dashboard Tasks Calendar Timesheet  CRM  Clients Leads Pipeline Invoices  PERFORMANCE  Ads Spend...`

---

### Settings → Integrations — `/settings/integrations`
**Status:** `unimplemented` | **Load:** 3325ms | **HTTP:** 200

**Issues:**
- Placeholder: Coming Soon

**Placeholder/Dead Text:**
- `Coming Soon`

**Content Preview:** `Lewati ke konten utama Hadona Workspace  OPERATIONAL  Dashboard Tasks Calendar Timesheet  CRM  Clients Leads Pipeline Invoices  PERFORMANCE  Ads Spend...`

---

## ⏱️ Performance Analysis

**Slow Routes (>3s):**

| Route | Load Time |
|---|---|
| `/chat` Team Chat | 6.37s |
| `/` Dashboard | 5.76s |
| `/settings` Settings (Index) | 5.53s |
| `/clients` Clients | 4.77s |
| `/reports` Weekly Reports | 4.28s |
| `/settings/preferences` Settings → Preferences | 4.08s |
| `/settings/security` Settings → Security | 4.04s |
| `/settings/workspace` Settings → Workspace | 4.00s |
| `/brand-kits` Brand Kits | 3.98s |
| `/settings/profile` Settings → Profile | 3.88s |
| `/ads-spend` Ads Spend | 3.86s |
| `/users` User Management | 3.85s |
| `/settings/notifications` Settings → Notifications | 3.64s |
| `/calendar` Calendar | 3.61s |
| `/content-plans` Content Plans | 3.52s |
| `/leads` Leads (CRM) | 3.50s |
| `/creative` Creative Requests | 3.45s |
| `/content-studio` Content Studio | 3.38s |
| `/settings/integrations` Settings → Integrations | 3.33s |
| `/invoices` Invoices | 3.31s |
| `/production` Production | 3.23s |
| `/tasks` Tasks | 3.10s |
| `/timesheet` Timesheet | 3.10s |

## 💡 Recommendations

### 🟠 Medium — Warnings (2)
- `/` — 1 API failure(s); Slow load: 5.8s
- `/chat` — 1 API failure(s); Slow load: 6.4s

### 🟡 Low — Unimplemented (3)
- `/settings/notifications` — Placeholder: coming soon
- `/settings/preferences` — Placeholder: Coming Soon
- `/settings/integrations` — Placeholder: Coming Soon

### ⏱️ Performance — Slow Routes
- Consider optimizing API calls and database queries
- Reduce waterfall requests (batch parallel calls)
- Add caching for frequently accessed data
