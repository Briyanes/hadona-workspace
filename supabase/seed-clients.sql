-- ============================================
-- HADONA WORKSPACE - CLIENT MASTER DATA SEED
-- Run AFTER schema.sql
-- Contains all clients discovered from Google Sheets
-- ============================================

INSERT INTO public.clients (name, slug, industry, status, services) VALUES
  ('RMODA Workshop', 'rmoda-workshop', 'Automotive', 'active', ARRAY['Meta Ads','CTWA']),
  ('RMODA Studio BSD', 'rmoda-studio-bsd', 'Automotive', 'active', ARRAY['Meta Ads','CTWA']),
  ('RMODA Studio Makassar', 'rmoda-studio-makassar', 'Automotive', 'inactive', ARRAY['Meta Ads','CTWA']),
  ('RMODA Autospa Kelapa Gading', 'rmoda-autospa-kelapa-gading', 'Automotive', 'inactive', ARRAY['Meta Ads','CTWA']),
  ('Tombo Ati', 'tombo-ati', 'Tour & Travel', 'active', ARRAY['Meta Ads','Google Ads']),
  ('Bolu Pisang Bu Winda', 'bolu-pisang-bu-winda', 'Food & Beverage', 'inactive', ARRAY['Meta Ads','CTWA']),
  ('TPDOC', 'tpdoc', 'Health & Wellness', 'active', ARRAY['Meta Ads','CTWA','SMM']),
  ('YBD (YourBestDeal)', 'ybd-yourbestdeal', 'E-commerce', 'active', ARRAY['Meta Ads','Website Purchase']),
  ('RAHA Pro', 'raha-pro', 'Consumer Goods', 'active', ARRAY['Meta Ads','CTWA']),
  ('OCEAN Transport', 'ocean-transport', 'Transportation', 'active', ARRAY['Meta Ads','CTWA']),
  ('Threenine (36)', 'threenine-36', 'Retail', 'active', ARRAY['Meta Ads']),
  ('Tape Ketan 181', 'tape-ketan-181', 'Food & Beverage', 'active', ARRAY['Meta Ads','CPAS','SMM']),
  ('EnglishUp', 'englishup', 'Education', 'active', ARRAY['SMM']),
  ('Nouban', 'nouban', 'Food & Beverage', 'active', ARRAY['Meta Ads','SMM','Content Production','CPAS']),
  ('SHUMI Japan', 'shumi-japan', 'Food & Beverage', 'active', ARRAY['Meta Ads','CPAS']),
  ('Travel Haji Umroh', 'travel-haji-umroh', 'Tour & Travel', 'active', ARRAY['Google Ads','Meta Ads']),
  ('23 Trans & Tour', '23-trans-tour', 'Tour & Travel', 'active', ARRAY['SMM']),
  ('Tree Top Game', 'tree-top-game', 'Gaming', 'inactive', ARRAY['Meta Ads','Google Ads']),
  ('Tree Top Up', 'tree-top-up', 'Gaming', 'inactive', ARRAY['Google Ads']),
  ('Anurakti', 'anurakti', 'Lifestyle', 'inactive', ARRAY['Meta Ads','CTWA']),
  ('Olive Cookies', 'olive-cookies', 'Food & Beverage', 'inactive', ARRAY['Meta Ads','CTWA']),
  ('EOP', 'eop', 'Education', 'inactive', ARRAY['Meta Ads','CTWA']),
  ('Marichan', 'marichan', 'Food & Beverage', 'inactive', ARRAY['Meta Ads','CPAS']),
  ('Seblak Instan', 'seblak-instan', 'Food & Beverage', 'inactive', ARRAY['Meta Ads','CTWA']),
  ('EJA Tour and Travel', 'eja-tour-travel', 'Tour & Travel', 'active', ARRAY['Meta Ads']),
  ('Hadona Digital Media', 'hadona-digital-media', 'Agency (Internal)', 'active', ARRAY['Internal']),
  ('BFI Finance', 'bfi-finance', 'Finance', 'inactive', ARRAY['Meta Ads']),
  ('Benvit - AME', 'benvit-ame', 'Health & Wellness', 'inactive', ARRAY['Meta Ads']),
  ('LYN Skylounge', 'lyn-skylounge', 'Hospitality', 'inactive', ARRAY['Meta Ads']),
  ('Vherkudara Store', 'vherkudara-store', 'Fashion', 'active', ARRAY['Meta Ads']),
  ('Akbar Store', 'akbar-store', 'Retail', 'active', ARRAY['Meta Ads']),
  ('MPASI', 'mpasi', 'Baby Food', 'active', ARRAY['Meta Ads']),
  ('Ndarboy Genk', 'ndarboy-genk', 'Entertainment', 'inactive', ARRAY['Meta Ads']),
  ('After Glow', 'after-glow', 'Lifestyle', 'inactive', ARRAY['Meta Ads']),
  ('Bossfa', 'bossfa', 'Food & Beverage', 'inactive', ARRAY['Meta Ads']),
  ('Haena Kontraktor', 'haena-kontraktor', 'Construction', 'inactive', ARRAY['Meta Ads']),
  ('Aymalabel', 'aymalabel', 'Fashion', 'inactive', ARRAY['Meta Ads']),
  ('EAZYTAX', 'eazytax', 'Finance', 'inactive', ARRAY['Meta Ads'])
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- DIVISION & PIC REFERENCE (For migration)
-- Discovered from Task Manager Sheet:
-- Divisions: Creative Director, Advertiser, Account Executive
-- PICs: Ovi, Yoga, Dika, Devi
-- ============================================
-- Note: Create user accounts in Supabase Auth first,
-- then profiles will be auto-created via trigger.