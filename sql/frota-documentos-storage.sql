-- =============================================================================
-- Frota — bucket de documentos dos veículos (CRLV, apólice, IPVA, laudo...)
-- A tabela frota_documentos já existe (create-frota-module.sql §8); este
-- arquivo cria só o Storage. O upload passa pela rota /api/frota/documentos
-- (service role), então não precisa de policy de INSERT pra authenticated.
-- Correr no Supabase: SQL Editor -> colar -> Run. Idempotente.
-- =============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('frota-documentos', 'frota-documentos', true)
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "read_frota_documentos" ON storage.objects;
CREATE POLICY "read_frota_documentos" ON storage.objects
  FOR SELECT USING (bucket_id = 'frota-documentos');
