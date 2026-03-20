-- Criar bucket para armazenar PDFs de revisões
INSERT INTO storage.buckets (id, name, public)
VALUES ('revisoes', 'revisoes', true)
ON CONFLICT DO NOTHING;

-- Políticas de acesso — permitir upload e leitura
CREATE POLICY "upload_revisoes" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'revisoes');

CREATE POLICY "read_revisoes" ON storage.objects
  FOR SELECT USING (bucket_id = 'revisoes');

CREATE POLICY "update_revisoes" ON storage.objects
  FOR UPDATE USING (bucket_id = 'revisoes');

CREATE POLICY "delete_revisoes" ON storage.objects
  FOR DELETE USING (bucket_id = 'revisoes');
