-- =============================================================================
-- frota_veiculos: VENDA + EQUIPAMENTOS (pedido de 15/07/2026)
--
-- Venda: o carro vendido NÃO é apagado — vira histórico (status='vendido',
-- ativo=false) com o registro de pra quem, quando e por quanto. Ao confirmar
-- a venda o portal também:
--   - encerra o responsável em aberto (frota_responsaveis.fim = data da venda)
--   - desativa a linha em Placas (ativo=false) → o carro SAI do patrimônio do
--     DRE (o calc filtra ativo !== false)
--
-- Equipamentos: acessórios instalados no carro ("tunagem" — insulfilm,
-- suporte, rádio...). Editável na Ficha; cada item vira linha do CHECKLIST
-- PRÉ-VENDA ("o que tirar antes de entregar"), junto com rastreador/seguro.
--
-- Rodar no SQL Editor do Supabase (idempotente).
-- =============================================================================

ALTER TABLE frota_veiculos
  ADD COLUMN IF NOT EXISTS venda_data      DATE,
  ADD COLUMN IF NOT EXISTS venda_valor     NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS venda_comprador TEXT,
  ADD COLUMN IF NOT EXISTS venda_obs       TEXT,
  ADD COLUMN IF NOT EXISTS equipamentos    TEXT[] NOT NULL DEFAULT '{}',
  -- "ano do documento": exercício do CRLV (licenciamento). Preenchido pela
  -- leitura automática do CRLV ou na mão. Exercício < ano atual = pendência
  -- vermelha ("documento atrasado").
  ADD COLUMN IF NOT EXISTS exercicio_crlv  INT;

COMMENT ON COLUMN frota_veiculos.venda_comprador IS 'Pra quem o veículo foi vendido (registro histórico — o veículo fica com status=vendido, ativo=false).';
COMMENT ON COLUMN frota_veiculos.equipamentos IS 'Acessórios instalados (insulfilm, suporte, rádio...). Cada item entra no checklist pré-venda.';
COMMENT ON COLUMN frota_veiculos.exercicio_crlv IS 'Ano do documento (exercício do CRLV/licenciamento). Menor que o ano atual = pendência.';
