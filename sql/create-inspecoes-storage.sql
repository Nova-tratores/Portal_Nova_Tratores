-- Bucket para PDFs de inspeção de pré-entrega
INSERT INTO storage.buckets (id, name, public)
VALUES ('inspecoes', 'inspecoes', true)
ON CONFLICT DO NOTHING;

CREATE POLICY "upload_inspecoes" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'inspecoes');

CREATE POLICY "read_inspecoes" ON storage.objects
  FOR SELECT USING (bucket_id = 'inspecoes');

CREATE POLICY "update_inspecoes" ON storage.objects
  FOR UPDATE USING (bucket_id = 'inspecoes');

CREATE POLICY "delete_inspecoes" ON storage.objects
  FOR DELETE USING (bucket_id = 'inspecoes');
