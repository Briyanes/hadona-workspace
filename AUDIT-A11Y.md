# AUDIT A11Y (Accessibility) — 2026-09-02

Scope: 20 halaman dashboard (viewport desktop 1440x900, logged-in admin).
Tools: axe-core (wcag2a/2aa/21aa + best-practice) + custom checks (font kecil, icon button, input label, kontras).

## Ringkasan

| Kategori | Temuan |
|---|---|
| axe-core violations | **784** dari 9 rule |
| Font < 11.5px | **1645** elemen |
| Icon-only button tanpa nama aksesibel | **2** |
| Input tanpa label | **75** |
| Kontras WCAG AA gagal | **55** |

## A. axe-core (agregat per rule)

| Rule | Impact | Total | Halaman |
|---|---|---|---|
| `color-contrast` | serious | 675 | Dashboard, Tasks, Chat, Content Plans, Content Studio, Production, Creative, Reports, Clients, Calendar, Strategy, Invoices, Ads Spend, Approvals, Leads, Timesheet, Monthly Reports, Brand Kits, Users, Settings Integrations |
| `label` | critical | 52 | Ads Spend, Timesheet |
| `select-name` | critical | 23 | Content Plans, Content Studio, Creative, Reports, Invoices, Ads Spend, Timesheet, Monthly Reports, Users |
| `region` | moderate | 19 | Dashboard, Tasks, Content Plans, Content Studio, Production, Creative, Reports, Clients, Calendar, Strategy, Invoices, Ads Spend, Approvals, Leads, Timesheet, Monthly Reports, Brand Kits, Users, Settings Integrations |
| `image-redundant-alt` | minor | 6 | Users |
| `heading-order` | moderate | 5 | Dashboard, Content Plans, Reports, Clients, Settings Integrations |
| `label-title-only` | serious | 2 | Content Studio, Creative |
| `scrollable-region-focusable` | serious | 1 | Dashboard |
| `empty-table-header` | minor | 1 | Ads Spend |

## B. Font kecil (< 11.5px) per halaman

### Dashboard (119)
- `10px` "Workspace" — di Hadona Workspace
- `10px` "OPERATIONAL" — di OPERATIONAL Dashboard Tasks Calendar Tim
- `10px` "CRM" — di CRM Clients Leads Pipeline Invoices
- `10px` "PERFORMANCE" — di PERFORMANCE Ads Spend Weekly Report Mont
- `10px` "CREATIVE" — di CREATIVE Content Plans Content Studio Pr
- `10px` "COMMUNICATION" — di COMMUNICATION Team Chat
- `10px` "ADMIN" — di ADMIN User Management
- `10px` "Super Admin" — di Super Admin
- … +111 lainnya (lihat a11y-report.json)

### Tasks (1006)
- `10px` "Workspace" — di Hadona Workspace
- `10px` "OPERATIONAL" — di OPERATIONAL Dashboard Tasks Calendar Tim
- `10px` "CRM" — di CRM Clients Leads Pipeline Invoices
- `10px` "PERFORMANCE" — di PERFORMANCE Ads Spend Weekly Report Mont
- `10px` "CREATIVE" — di CREATIVE Content Plans Content Studio Pr
- `10px` "COMMUNICATION" — di COMMUNICATION Team Chat
- `10px` "ADMIN" — di ADMIN User Management
- `10px` "Super Admin" — di Super Admin
- … +998 lainnya (lihat a11y-report.json)

### Chat (60)
- `10px` "Workspace" — di Hadona Workspace
- `10px` "OPERATIONAL" — di OPERATIONAL Dashboard Tasks Calendar Tim
- `10px` "CRM" — di CRM Clients Leads Pipeline Invoices
- `10px` "PERFORMANCE" — di PERFORMANCE Ads Spend Weekly Report Mont
- `10px` "CREATIVE" — di CREATIVE Content Plans Content Studio Pr
- `10px` "COMMUNICATION" — di COMMUNICATION Team Chat
- `10px` "ADMIN" — di ADMIN User Management
- `10px` "Super Admin" — di Super Admin
- … +52 lainnya (lihat a11y-report.json)

### Content Plans (9)
- `10px` "Workspace" — di Hadona Workspace
- `10px` "OPERATIONAL" — di OPERATIONAL Dashboard Tasks Calendar Tim
- `10px` "CRM" — di CRM Clients Leads Pipeline Invoices
- `10px` "PERFORMANCE" — di PERFORMANCE Ads Spend Weekly Report Mont
- `10px` "CREATIVE" — di CREATIVE Content Plans Content Studio Pr
- `10px` "COMMUNICATION" — di COMMUNICATION Team Chat
- `10px` "ADMIN" — di ADMIN User Management
- `10px` "Super Admin" — di Super Admin
- … +1 lainnya (lihat a11y-report.json)

### Content Studio (9)
- `10px` "Workspace" — di Hadona Workspace
- `10px` "OPERATIONAL" — di OPERATIONAL Dashboard Tasks Calendar Tim
- `10px` "CRM" — di CRM Clients Leads Pipeline Invoices
- `10px` "PERFORMANCE" — di PERFORMANCE Ads Spend Weekly Report Mont
- `10px` "CREATIVE" — di CREATIVE Content Plans Content Studio Pr
- `10px` "COMMUNICATION" — di COMMUNICATION Team Chat
- `10px` "ADMIN" — di ADMIN User Management
- `10px` "Super Admin" — di Super Admin
- … +1 lainnya (lihat a11y-report.json)

### Production (9)
- `10px` "Workspace" — di Hadona Workspace
- `10px` "OPERATIONAL" — di OPERATIONAL Dashboard Tasks Calendar Tim
- `10px` "CRM" — di CRM Clients Leads Pipeline Invoices
- `10px` "PERFORMANCE" — di PERFORMANCE Ads Spend Weekly Report Mont
- `10px` "CREATIVE" — di CREATIVE Content Plans Content Studio Pr
- `10px` "COMMUNICATION" — di COMMUNICATION Team Chat
- `10px` "ADMIN" — di ADMIN User Management
- `10px` "Super Admin" — di Super Admin
- … +1 lainnya (lihat a11y-report.json)

### Creative (9)
- `10px` "Workspace" — di Hadona Workspace
- `10px` "OPERATIONAL" — di OPERATIONAL Dashboard Tasks Calendar Tim
- `10px` "CRM" — di CRM Clients Leads Pipeline Invoices
- `10px` "PERFORMANCE" — di PERFORMANCE Ads Spend Weekly Report Mont
- `10px` "CREATIVE" — di CREATIVE Content Plans Content Studio Pr
- `10px` "COMMUNICATION" — di COMMUNICATION Team Chat
- `10px` "ADMIN" — di ADMIN User Management
- `10px` "Super Admin" — di Super Admin
- … +1 lainnya (lihat a11y-report.json)

### Reports (63)
- `10px` "Workspace" — di Hadona Workspace
- `10px` "OPERATIONAL" — di OPERATIONAL Dashboard Tasks Calendar Tim
- `10px` "CRM" — di CRM Clients Leads Pipeline Invoices
- `10px` "PERFORMANCE" — di PERFORMANCE Ads Spend Weekly Report Mont
- `10px` "CREATIVE" — di CREATIVE Content Plans Content Studio Pr
- `10px` "COMMUNICATION" — di COMMUNICATION Team Chat
- `10px` "ADMIN" — di ADMIN User Management
- `10px` "Super Admin" — di Super Admin
- … +55 lainnya (lihat a11y-report.json)

### Clients (27)
- `10px` "Workspace" — di Hadona Workspace
- `10px` "OPERATIONAL" — di OPERATIONAL Dashboard Tasks Calendar Tim
- `10px` "CRM" — di CRM Clients Leads Pipeline Invoices
- `10px` "PERFORMANCE" — di PERFORMANCE Ads Spend Weekly Report Mont
- `10px` "CREATIVE" — di CREATIVE Content Plans Content Studio Pr
- `10px` "COMMUNICATION" — di COMMUNICATION Team Chat
- `10px` "ADMIN" — di ADMIN User Management
- `10px` "Super Admin" — di Super Admin
- … +19 lainnya (lihat a11y-report.json)

### Calendar (70)
- `10px` "Workspace" — di Hadona Workspace
- `10px` "OPERATIONAL" — di OPERATIONAL Dashboard Tasks Calendar Tim
- `10px` "CRM" — di CRM Clients Leads Pipeline Invoices
- `10px` "PERFORMANCE" — di PERFORMANCE Ads Spend Weekly Report Mont
- `10px` "CREATIVE" — di CREATIVE Content Plans Content Studio Pr
- `10px` "COMMUNICATION" — di COMMUNICATION Team Chat
- `10px` "ADMIN" — di ADMIN User Management
- `10px` "Super Admin" — di Super Admin
- … +62 lainnya (lihat a11y-report.json)

### Strategy (9)
- `10px` "Workspace" — di Hadona Workspace
- `10px` "OPERATIONAL" — di OPERATIONAL Dashboard Tasks Calendar Tim
- `10px` "CRM" — di CRM Clients Leads Pipeline Invoices
- `10px` "PERFORMANCE" — di PERFORMANCE Ads Spend Weekly Report Mont
- `10px` "CREATIVE" — di CREATIVE Content Plans Content Studio Pr
- `10px` "COMMUNICATION" — di COMMUNICATION Team Chat
- `10px` "ADMIN" — di ADMIN User Management
- `10px` "Super Admin" — di Super Admin
- … +1 lainnya (lihat a11y-report.json)

### Invoices (13)
- `10px` "Workspace" — di Hadona Workspace
- `10px` "OPERATIONAL" — di OPERATIONAL Dashboard Tasks Calendar Tim
- `10px` "CRM" — di CRM Clients Leads Pipeline Invoices
- `10px` "PERFORMANCE" — di PERFORMANCE Ads Spend Weekly Report Mont
- `10px` "CREATIVE" — di CREATIVE Content Plans Content Studio Pr
- `10px` "COMMUNICATION" — di COMMUNICATION Team Chat
- `10px` "ADMIN" — di ADMIN User Management
- `10px` "Super Admin" — di Super Admin
- … +5 lainnya (lihat a11y-report.json)

### Ads Spend (116)
- `10px` "Workspace" — di Hadona Workspace
- `10px` "OPERATIONAL" — di OPERATIONAL Dashboard Tasks Calendar Tim
- `10px` "CRM" — di CRM Clients Leads Pipeline Invoices
- `10px` "PERFORMANCE" — di PERFORMANCE Ads Spend Weekly Report Mont
- `10px` "CREATIVE" — di CREATIVE Content Plans Content Studio Pr
- `10px` "COMMUNICATION" — di COMMUNICATION Team Chat
- `10px` "ADMIN" — di ADMIN User Management
- `10px` "Super Admin" — di Super Admin
- … +108 lainnya (lihat a11y-report.json)

### Approvals (13)
- `10px` "Workspace" — di Hadona Workspace
- `10px` "OPERATIONAL" — di OPERATIONAL Dashboard Tasks Calendar Tim
- `10px` "CRM" — di CRM Clients Leads Pipeline Invoices
- `10px` "PERFORMANCE" — di PERFORMANCE Ads Spend Weekly Report Mont
- `10px` "CREATIVE" — di CREATIVE Content Plans Content Studio Pr
- `10px` "COMMUNICATION" — di COMMUNICATION Team Chat
- `10px` "ADMIN" — di ADMIN User Management
- `10px` "Super Admin" — di Super Admin
- … +5 lainnya (lihat a11y-report.json)

### Leads (17)
- `10px` "Workspace" — di Hadona Workspace
- `10px` "OPERATIONAL" — di OPERATIONAL Dashboard Tasks Calendar Tim
- `10px` "CRM" — di CRM Clients Leads Pipeline Invoices
- `10px` "PERFORMANCE" — di PERFORMANCE Ads Spend Weekly Report Mont
- `10px` "CREATIVE" — di CREATIVE Content Plans Content Studio Pr
- `10px` "COMMUNICATION" — di COMMUNICATION Team Chat
- `10px` "ADMIN" — di ADMIN User Management
- `10px` "Super Admin" — di Super Admin
- … +9 lainnya (lihat a11y-report.json)

### Timesheet (13)
- `10px` "Workspace" — di Hadona Workspace
- `10px` "OPERATIONAL" — di OPERATIONAL Dashboard Tasks Calendar Tim
- `10px` "CRM" — di CRM Clients Leads Pipeline Invoices
- `10px` "PERFORMANCE" — di PERFORMANCE Ads Spend Weekly Report Mont
- `10px` "CREATIVE" — di CREATIVE Content Plans Content Studio Pr
- `10px` "COMMUNICATION" — di COMMUNICATION Team Chat
- `10px` "ADMIN" — di ADMIN User Management
- `10px` "Super Admin" — di Super Admin
- … +5 lainnya (lihat a11y-report.json)

### Monthly Reports (9)
- `10px` "Workspace" — di Hadona Workspace
- `10px` "OPERATIONAL" — di OPERATIONAL Dashboard Tasks Calendar Tim
- `10px` "CRM" — di CRM Clients Leads Pipeline Invoices
- `10px` "PERFORMANCE" — di PERFORMANCE Ads Spend Weekly Report Mont
- `10px` "CREATIVE" — di CREATIVE Content Plans Content Studio Pr
- `10px` "COMMUNICATION" — di COMMUNICATION Team Chat
- `10px` "ADMIN" — di ADMIN User Management
- `10px` "Super Admin" — di Super Admin
- … +1 lainnya (lihat a11y-report.json)

### Brand Kits (9)
- `10px` "Workspace" — di Hadona Workspace
- `10px` "OPERATIONAL" — di OPERATIONAL Dashboard Tasks Calendar Tim
- `10px` "CRM" — di CRM Clients Leads Pipeline Invoices
- `10px` "PERFORMANCE" — di PERFORMANCE Ads Spend Weekly Report Mont
- `10px` "CREATIVE" — di CREATIVE Content Plans Content Studio Pr
- `10px` "COMMUNICATION" — di COMMUNICATION Team Chat
- `10px` "ADMIN" — di ADMIN User Management
- `10px` "Super Admin" — di Super Admin
- … +1 lainnya (lihat a11y-report.json)

### Users (55)
- `10px` "Workspace" — di Hadona Workspace
- `10px` "OPERATIONAL" — di OPERATIONAL Dashboard Tasks Calendar Tim
- `10px` "CRM" — di CRM Clients Leads Pipeline Invoices
- `10px` "PERFORMANCE" — di PERFORMANCE Ads Spend Weekly Report Mont
- `10px` "CREATIVE" — di CREATIVE Content Plans Content Studio Pr
- `10px` "COMMUNICATION" — di COMMUNICATION Team Chat
- `10px` "ADMIN" — di ADMIN User Management
- `10px` "Super Admin" — di Super Admin
- … +47 lainnya (lihat a11y-report.json)

### Settings Integrations (10)
- `10px` "Workspace" — di Hadona Workspace
- `10px` "OPERATIONAL" — di OPERATIONAL Dashboard Tasks Calendar Tim
- `10px` "CRM" — di CRM Clients Leads Pipeline Invoices
- `10px` "PERFORMANCE" — di PERFORMANCE Ads Spend Weekly Report Mont
- `10px` "CREATIVE" — di CREATIVE Content Plans Content Studio Pr
- `10px` "COMMUNICATION" — di COMMUNICATION Team Chat
- `10px` "ADMIN" — di ADMIN User Management
- `10px` "Super Admin" — di Super Admin
- … +2 lainnya (lihat a11y-report.json)

## C. Icon-only button tanpa nama aksesibel

### Reports (2)
- `button` di div.absolute.right-0
- `button` di div.absolute.right-0

## D. Input tanpa label

### Content Plans (4)
- `select` name=?
- `select` name=?
- `select` name=?
- `select` name=?

### Content Studio (2)
- `select` name=?
- `select` name=?

### Creative (2)
- `select` name=?
- `select` name=?

### Reports (3)
- `select` name=?
- `select` name=?
- `select` name=?

### Invoices (2)
- `select` name=?
- `select` name=?

### Ads Spend (54)
- `select` name=?
- `select` name=?
- `select` name=?
- `checkbox` name=?
- `checkbox` name=?
- `checkbox` name=?

### Timesheet (4)
- `select` name=?
- `select` name=?
- `date` name=?
- `select` name=?

### Monthly Reports (2)
- `select` name=?
- `select` name=?

### Users (2)
- `select` name=?
- `select` name=?

## E. Kontras WCAG AA gagal

### Dashboard (2)
- rasio 3.6:1 (butuh 4.5) "Super Admin" fg=rgb(239, 68, 68) bg=rgb(248, 250, 252)
- rasio 3.76:1 (butuh 4.5) "14" fg=rgb(255, 255, 255) bg=rgb(239, 68, 68)

### Tasks (2)
- rasio 3.6:1 (butuh 4.5) "Super Admin" fg=rgb(239, 68, 68) bg=rgb(248, 250, 252)
- rasio 3.76:1 (butuh 4.5) "14" fg=rgb(255, 255, 255) bg=rgb(239, 68, 68)

### Chat (17)
- rasio 3.6:1 (butuh 4.5) "Super Admin" fg=rgb(239, 68, 68) bg=rgb(248, 250, 252)
- rasio 3.76:1 (butuh 4.5) "14" fg=rgb(255, 255, 255) bg=rgb(239, 68, 68)
- rasio 4.39:1 (butuh 4.5) "22 August 2026" fg=rgb(107, 114, 128) bg=rgb(243, 244, 246)
- rasio 4.39:1 (butuh 4.5) "25 August 2026" fg=rgb(107, 114, 128) bg=rgb(243, 244, 246)
- rasio 4.39:1 (butuh 4.5) "📹 HDN Advertising memulai gro" fg=rgb(107, 114, 128) bg=rgb(243, 244, 246)
- rasio 4.39:1 (butuh 4.5) "📹 Group call berakhir" fg=rgb(107, 114, 128) bg=rgb(243, 244, 246)

### Content Plans (2)
- rasio 3.6:1 (butuh 4.5) "Super Admin" fg=rgb(239, 68, 68) bg=rgb(248, 250, 252)
- rasio 3.76:1 (butuh 4.5) "14" fg=rgb(255, 255, 255) bg=rgb(239, 68, 68)

### Content Studio (2)
- rasio 3.6:1 (butuh 4.5) "Super Admin" fg=rgb(239, 68, 68) bg=rgb(248, 250, 252)
- rasio 3.76:1 (butuh 4.5) "14" fg=rgb(255, 255, 255) bg=rgb(239, 68, 68)

### Production (2)
- rasio 3.6:1 (butuh 4.5) "Super Admin" fg=rgb(239, 68, 68) bg=rgb(248, 250, 252)
- rasio 3.76:1 (butuh 4.5) "14" fg=rgb(255, 255, 255) bg=rgb(239, 68, 68)

### Creative (2)
- rasio 3.6:1 (butuh 4.5) "Super Admin" fg=rgb(239, 68, 68) bg=rgb(248, 250, 252)
- rasio 3.76:1 (butuh 4.5) "14" fg=rgb(255, 255, 255) bg=rgb(239, 68, 68)

### Reports (2)
- rasio 3.6:1 (butuh 4.5) "Super Admin" fg=rgb(239, 68, 68) bg=rgb(248, 250, 252)
- rasio 3.76:1 (butuh 4.5) "14" fg=rgb(255, 255, 255) bg=rgb(239, 68, 68)

### Clients (2)
- rasio 3.6:1 (butuh 4.5) "Super Admin" fg=rgb(239, 68, 68) bg=rgb(248, 250, 252)
- rasio 3.76:1 (butuh 4.5) "14" fg=rgb(255, 255, 255) bg=rgb(239, 68, 68)

### Calendar (2)
- rasio 3.6:1 (butuh 4.5) "Super Admin" fg=rgb(239, 68, 68) bg=rgb(248, 250, 252)
- rasio 3.76:1 (butuh 4.5) "14" fg=rgb(255, 255, 255) bg=rgb(239, 68, 68)

### Strategy (2)
- rasio 3.6:1 (butuh 4.5) "Super Admin" fg=rgb(239, 68, 68) bg=rgb(248, 250, 252)
- rasio 3.76:1 (butuh 4.5) "14" fg=rgb(255, 255, 255) bg=rgb(239, 68, 68)

### Invoices (2)
- rasio 3.6:1 (butuh 4.5) "Super Admin" fg=rgb(239, 68, 68) bg=rgb(248, 250, 252)
- rasio 3.76:1 (butuh 4.5) "14" fg=rgb(255, 255, 255) bg=rgb(239, 68, 68)

### Ads Spend (2)
- rasio 3.6:1 (butuh 4.5) "Super Admin" fg=rgb(239, 68, 68) bg=rgb(248, 250, 252)
- rasio 3.76:1 (butuh 4.5) "14" fg=rgb(255, 255, 255) bg=rgb(239, 68, 68)

### Approvals (2)
- rasio 3.6:1 (butuh 4.5) "Super Admin" fg=rgb(239, 68, 68) bg=rgb(248, 250, 252)
- rasio 3.76:1 (butuh 4.5) "14" fg=rgb(255, 255, 255) bg=rgb(239, 68, 68)

### Leads (2)
- rasio 3.6:1 (butuh 4.5) "Super Admin" fg=rgb(239, 68, 68) bg=rgb(248, 250, 252)
- rasio 3.76:1 (butuh 4.5) "14" fg=rgb(255, 255, 255) bg=rgb(239, 68, 68)

### Timesheet (2)
- rasio 3.6:1 (butuh 4.5) "Super Admin" fg=rgb(239, 68, 68) bg=rgb(248, 250, 252)
- rasio 3.76:1 (butuh 4.5) "14" fg=rgb(255, 255, 255) bg=rgb(239, 68, 68)

### Monthly Reports (2)
- rasio 3.6:1 (butuh 4.5) "Super Admin" fg=rgb(239, 68, 68) bg=rgb(248, 250, 252)
- rasio 3.76:1 (butuh 4.5) "14" fg=rgb(255, 255, 255) bg=rgb(239, 68, 68)

### Brand Kits (2)
- rasio 3.6:1 (butuh 4.5) "Super Admin" fg=rgb(239, 68, 68) bg=rgb(248, 250, 252)
- rasio 3.76:1 (butuh 4.5) "14" fg=rgb(255, 255, 255) bg=rgb(239, 68, 68)

### Users (2)
- rasio 3.6:1 (butuh 4.5) "Super Admin" fg=rgb(239, 68, 68) bg=rgb(248, 250, 252)
- rasio 3.76:1 (butuh 4.5) "14" fg=rgb(255, 255, 255) bg=rgb(239, 68, 68)

### Settings Integrations (2)
- rasio 3.6:1 (butuh 4.5) "Super Admin" fg=rgb(239, 68, 68) bg=rgb(248, 250, 252)
- rasio 3.76:1 (butuh 4.5) "14" fg=rgb(255, 255, 255) bg=rgb(239, 68, 68)
