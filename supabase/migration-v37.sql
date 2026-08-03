-- ============================================
-- Migration v37: Create Supabase Storage Buckets
-- Replaces R2 for file uploads (logos, creative assets, attachments)
-- ============================================

-- Create buckets (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('client-logos', 'client-logos', true),
  ('client-attachments', 'client-attachments', true),
  ('weekly-report-pdfs', 'weekly-report-pdfs', true),
  ('creative-assets', 'creative-assets', true),
  ('avatar-assets', 'avatar-assets', true),
  ('task-attachments', 'task-attachments', true),
  ('uploads', 'uploads', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- Storage Policies: Only authenticated users can upload
-- Public read for all (since these are public assets)
-- ============================================

-- Client Logos
CREATE POLICY "Allow auth upload to client-logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'client-logos');

CREATE POLICY "Allow public read client-logos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'client-logos');

CREATE POLICY "Allow auth delete client-logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'client-logos');

-- Client Attachments
CREATE POLICY "Allow auth upload to client-attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'client-attachments');

CREATE POLICY "Allow public read client-attachments"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'client-attachments');

CREATE POLICY "Allow auth delete client-attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'client-attachments');

-- Weekly Report PDFs
CREATE POLICY "Allow auth upload to weekly-report-pdfs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'weekly-report-pdfs');

CREATE POLICY "Allow public read weekly-report-pdfs"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'weekly-report-pdfs');

CREATE POLICY "Allow auth delete weekly-report-pdfs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'weekly-report-pdfs');

-- Creative Assets
CREATE POLICY "Allow auth upload to creative-assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'creative-assets');

CREATE POLICY "Allow public read creative-assets"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'creative-assets');

CREATE POLICY "Allow auth delete creative-assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'creative-assets');

-- Avatar Assets
CREATE POLICY "Allow auth upload to avatar-assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatar-assets');

CREATE POLICY "Allow public read avatar-assets"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatar-assets');

CREATE POLICY "Allow auth delete avatar-assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatar-assets');

-- Task Attachments
CREATE POLICY "Allow auth upload to task-attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'task-attachments');

CREATE POLICY "Allow public read task-attachments"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'task-attachments');

CREATE POLICY "Allow auth delete task-attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'task-attachments');

-- General Uploads
CREATE POLICY "Allow auth upload to uploads"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'uploads');

CREATE POLICY "Allow public read uploads"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'uploads');

CREATE POLICY "Allow auth delete uploads"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'uploads');