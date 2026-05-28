-- =============================================================================
-- Adiciona bairro e inscricao_estadual à tabela Clientes (vindos do Omie).
-- Esses campos já estão disponíveis na resposta ListarClientes da API Omie,
-- só não estavam sendo persistidos. Usados na geração da SG Mahindra
-- (J13 = Inscrição Estadual, K15 = Bairro).
-- =============================================================================

ALTER TABLE "Clientes"
  ADD COLUMN IF NOT EXISTS bairro TEXT,
  ADD COLUMN IF NOT EXISTS inscricao_estadual TEXT;
