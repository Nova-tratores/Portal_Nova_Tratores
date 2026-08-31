-- =====================================================================
-- Nova Tratores — /propostas: corrige criação de tags que falhava em silêncio
-- Data: 2026-08-31
--
-- Sintoma: ao criar uma tag no modal, ela não aparece (o insert do cliente
-- anon/authenticated era rejeitado). Causas possíveis numa tabela recém-criada:
--   1) RLS ligada sem policy  -> insert negado
--   2) grants não aplicados   -> permission denied
--   3) schema cache do PostgREST desatualizado -> tabela "não existe" p/ a API
--
-- Este script é idempotente e cobre as três. Rodar no SQL Editor do Supabase.
-- (proposta_tags é vocabulário público, escrito direto pelo cliente — mesmo
--  padrão de requisicao_tags.)
-- =====================================================================

-- 1) Garantir acesso do cliente
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON proposta_tags TO anon, authenticated;

-- 2) Desligar RLS (sem RLS os grants acima já bastam, como em requisicao_tags)
ALTER TABLE proposta_tags DISABLE ROW LEVEL SECURITY;

-- 3) Forçar o PostgREST a recarregar o schema (enxergar a tabela nova)
NOTIFY pgrst, 'reload schema';

-- Verificação (deve inserir e devolver a linha, sem erro de permissão):
--   INSERT INTO proposta_tags (nome, cor, grupo) VALUES ('TESTE', '#dc2626', 'geral') RETURNING *;
--   DELETE FROM proposta_tags WHERE nome = 'TESTE';
