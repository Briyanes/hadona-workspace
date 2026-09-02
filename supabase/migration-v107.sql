-- ═══════════════════════════════════════════════════════════════
-- Migration v107 — Normalisasi nilai divisi "Social Media Management"
-- ═══════════════════════════════════════════════════════════════
-- Problem: 50 task di production memiliki division = 'Social Media Management'
--          (typo/varian) yang TIDAK dikenal kode (canon: 'Social Media Manager').
--          Task-task ini tidak akan muncul di filter board divisi & tidak bisa
--          di-assign karena tidak ada user dengan divisi tsb.
--
-- Fix: UPDATE tasks SET division = 'Social Media Manager' WHERE ...
--       (idempotent — aman dijalankan berulang)
-- ═══════════════════════════════════════════════════════════════

-- 1. Normalisasi typo di tasks.division
UPDATE tasks
SET division = 'Social Media Manager'
WHERE division = 'Social Media Management';

-- Verifikasi (jalankan manual jika perlu):
-- SELECT division, COUNT(*) FROM tasks GROUP BY division ORDER BY count DESC;