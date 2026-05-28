-- =============================================================================
-- Migration one-shot: limpa oportunidades/registros que vieram exclusivamente
-- de `tratores` (controle interno do Portal) e nao bateram em Clientes do Omie.
--
-- Motivacao: cadastros em tratores estao inconsistentes (chassis errados, nomes
-- divergentes). A partir de agora R1/R2/R3 so geram oportunidade quando o
-- cliente bate em Clientes do Omie. Este script limpa os cards criados antes
-- dessa politica.
-- =============================================================================

-- 1) Reverter oportunidades vinculadas a registros Tratores Portal:
--    marca como dispensada e desvincula o feedback_id (pra registro poder ser excluido).
UPDATE feedback_oportunidades
SET status = 'dispensada',
    dispensada_motivo = 'Filtro automatico: cliente sem match no Omie (limpeza tratores)',
    feedback_id = NULL
WHERE feedback_id IN (
  SELECT id FROM feedback_registros
  WHERE origem_dados = 'Tratores (Portal)'
);

-- 2) Excluir os registros Tratores Portal que foram criados via Atender Quick
--    (status_atendimento aberto/em_andamento). Mantem os ja preenchidos como
--    concluido ou sem_resposta (esses tem informacao manual que pode valer).
DELETE FROM feedback_registros
WHERE origem_dados = 'Tratores (Portal)'
  AND status_atendimento IN ('aberto','em_andamento');
