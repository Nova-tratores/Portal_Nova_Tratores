-- =====================================================================
-- ROLLBACK de sql/create-feedback-chamada.sql
-- =====================================================================
-- Apaga as ligações registradas (feedback_chamada) e as colunas novas. Os
-- registros CRM/RFM e as oportunidades ficam como estão — inclusive os
-- efeitos de desfechos já aplicados (status/proximo_contato_em NÃO são
-- revertidos aqui; a coluna proximo_contato_em some junto).
-- Rodar no SQL Editor do projeto do Portal (citrhumdkfivdzbmayde).
-- =====================================================================

DROP FUNCTION IF EXISTS feedback_cancelar_chamada(uuid, uuid);
DROP FUNCTION IF EXISTS feedback_encerrar_chamada(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS feedback_iniciar_chamada(text, uuid, text, bigint, bigint, text);

DROP TRIGGER IF EXISTS tg_feedback_chamada_recontar ON feedback_chamada;
DROP TRIGGER IF EXISTS tg_feedback_chamada_touch    ON feedback_chamada;
DROP FUNCTION IF EXISTS feedback_chamada_recontar();
DROP FUNCTION IF EXISTS feedback_chamada_touch();

DROP TABLE IF EXISTS feedback_chamada;

ALTER TABLE feedback_registros
  DROP COLUMN IF EXISTS chamadas_count,
  DROP COLUMN IF EXISTS proximo_contato_em;

ALTER TABLE oportunidade_motivo
  DROP COLUMN IF EXISTS aplica_a;

NOTIFY pgrst, 'reload schema';
