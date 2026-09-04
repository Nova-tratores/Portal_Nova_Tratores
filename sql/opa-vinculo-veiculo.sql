-- Opa vinculado a um veículo da frota.
-- No "Novo Opa" a pessoa pode escolher a que o Opa se refere (por ora:
-- veículo da frota) e selecionar a placa. O motor de pendências
-- (lib/frota/pendencias-sync) abre uma pendência no carro (origem 'opa')
-- e FECHA sozinha quando o Opa é resolvido.
-- Campos genéricos de propósito: amanhã vinculo_tipo pode ser 'trator',
-- 'setor' etc. sem nova migração.
ALTER TABLE portal_opas ADD COLUMN IF NOT EXISTS vinculo_tipo TEXT;  -- 'veiculo'
ALTER TABLE portal_opas ADD COLUMN IF NOT EXISTS vinculo_ref TEXT;   -- placa
