-- =============================================================================
-- frota_veiculos: coluna `proprietario` (pedido de 14/07/2026)
--
-- O nome do PROPRIETÁRIO do veículo (quem está no documento — a empresa, um
-- sócio, banco em alienação etc). Não confundir com o RESPONSÁVEL (quem usa o
-- carro no dia a dia — esse tem histórico em frota_responsaveis).
--
-- É um campo 100% do portal (nenhuma fonte externa tem esse dado: Rota Exata,
-- Placas e SupaPlacas foram verificadas) — o sync nunca o toca, então não
-- precisa entrar em campos_manuais.
--
-- Rodar no SQL Editor do Supabase (idempotente).
-- =============================================================================

ALTER TABLE frota_veiculos
  ADD COLUMN IF NOT EXISTS proprietario TEXT;

COMMENT ON COLUMN frota_veiculos.proprietario IS
  'Nome do proprietário legal do veículo (documento/CRLV). Campo manual do portal — o sync da Rota Exata não escreve aqui.';
