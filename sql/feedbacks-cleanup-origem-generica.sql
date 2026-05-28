-- =============================================================================
-- Migration one-shot: limpa registros com origem nao identificada por empresa.
--
-- Politica: Oportunidades de R1/R2/R3 so geram card quando a origem é
-- "Omie NOVA" ou "Omie CASTRO". Tudo com "Omie" generico ou "Portal (interno)"
-- e descartado a partir desta versao. Este script limpa o que ja existe.
-- =============================================================================

-- 1) Reverter oportunidades vinculadas a esses registros: marca dispensada
--    e desvincula feedback_id pra registro poder ser excluido.
UPDATE feedback_oportunidades
SET status = 'dispensada',
    dispensada_motivo = 'Filtro automatico: origem sem empresa Omie identificada',
    feedback_id = NULL
WHERE feedback_id IN (
  SELECT id FROM feedback_registros
  WHERE origem_dados IN ('Omie', 'Portal (interno)', 'Portal', 'Tratores (Portal)')
);

-- 2) Excluir registros abertos via Atender Quick com origem suspeita.
--    Mantem concluidos e sem_resposta — esses tem informacao manual util.
DELETE FROM feedback_registros
WHERE origem_dados IN ('Omie', 'Portal (interno)', 'Portal', 'Tratores (Portal)')
  AND status_atendimento IN ('aberto','em_andamento');
