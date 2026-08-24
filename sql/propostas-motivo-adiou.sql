-- =====================================================================
-- Nova Tratores — /propostas: novo motivo de perda "Cliente adiou"
-- Data: 2026-08-24
-- JÁ APLICADO (motivo_perda id=11). A app lê motivo_perda dinamicamente.
-- Idempotente de verdade: ON CONFLICT (nome) — pode rodar quantas vezes quiser.
-- (A versão anterior tinha um WHERE dentro do agregado que recalculava id=1
--  quando o motivo já existia, causando "duplicate key ... id=1".)
-- =====================================================================

INSERT INTO motivo_perda (id, nome, exige_concorrente)
VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM motivo_perda), 'Cliente adiou', false)
ON CONFLICT (nome) DO NOTHING;

-- Verificação: SELECT id, nome FROM motivo_perda ORDER BY id;
