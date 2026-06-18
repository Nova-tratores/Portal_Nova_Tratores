-- Fase 1: tags do cliente (incl. "Não contatar" da caveira) por cliente.
-- Guardadas em feedback_clientes_info.tags (jsonb de strings). Na Fase 2 essas
-- tags serão sincronizadas com o cadastro do Omie.
-- Rodar no SQL Editor do projeto do Portal (citrhumdkfivdzbmayde).

ALTER TABLE feedback_clientes_info
  ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb;
