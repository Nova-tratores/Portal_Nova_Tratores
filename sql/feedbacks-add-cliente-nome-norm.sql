-- =============================================================================
-- Migration: corrige conflito de chave única em feedback_oportunidades.
--
-- Problema: a UNIQUE (regra, codigo_omie_norm, chassis_norm) gerava colisão
-- na regra R2_sem_os, onde diversos clientes têm tanto codigo_omie quanto
-- chassis nulos — todos colidiam em ("R2_sem_os", "", "") e o upsert do
-- batch inteiro falhava com:
--   "ON CONFLICT DO UPDATE command cannot affect row a second time"
--
-- Solução: incluir cliente_nome (normalizado) na chave única.
-- =============================================================================

-- Adiciona coluna gerada com cliente_nome normalizado
ALTER TABLE feedback_oportunidades
  ADD COLUMN IF NOT EXISTS cliente_nome_norm TEXT
  GENERATED ALWAYS AS (upper(trim(cliente_nome))) STORED;

-- Recria índice único incluindo cliente_nome_norm
DROP INDEX IF EXISTS uniq_feedback_oportunidades_regra_chave;
CREATE UNIQUE INDEX uniq_feedback_oportunidades_regra_chave
  ON feedback_oportunidades (regra, codigo_omie_norm, chassis_norm, cliente_nome_norm);
