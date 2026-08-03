-- ============================================
-- Migration v41: Storage Policies for Documents Bucket
-- Allows authenticated users to upload/read/update/delete
-- contract documents (PDF, images) in the 'documents' bucket
-- ============================================

-- ============================================
-- 1. Storage RLS Policies for 'documents' bucket
-- ============================================

-- Allow authenticated users to upload files
CREATE POLICY "documents_upload_auth" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents');

-- Allow public read access (bucket is public)
CREATE POLICY "documents_read_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents');

-- Allow authenticated users to update (replace docs)
CREATE POLICY "documents_update_auth" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'documents');

-- Allow authenticated users to delete files
CREATE POLICY "documents_delete_auth" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'documents');

-- ============================================
-- 2. Folder structure convention
-- ============================================
-- Contract documents are stored as:
--   documents/contracts/{contract_id}/signed-{timestamp}.pdf
-- This keeps files organized per-contract for easy auditing.