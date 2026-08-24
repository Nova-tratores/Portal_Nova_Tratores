-- =====================================================================
-- Nova Tratores — /propostas: novo motivo de perda "Cliente adiou"
-- Data: 2026-08-24
-- Idempotente (não duplica). A app lê motivo_perda dinamicamente — sem deploy.
-- =====================================================================

INSERT INTO motivo_perda (id, nome, exige_concorrente)
SELECT COALESCE(MAX(id), 0) + 1, 'Cliente adiou', false
  FROM motivo_perda
 WHERE NOT EXISTS (SELECT 1 FROM motivo_perda WHERE nome = 'Cliente adiou');

-- Verificação: SELECT id, nome FROM motivo_perda ORDER BY id;
