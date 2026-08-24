-- =====================================================================
-- Nova Tratores — /propostas: termômetro, frete no pedido, custo no cliente
-- Data: 2026-08-24
--
-- 1. Formulario.termometro (0-100) editável (padrão = probabilidade da fase).
-- 2. Proposta_Fabrica.frete_modalidade ('incluso'|'nao_incluso') + frete_valor
--    (custo do pedido já existe: Proposta_Fabrica.custo).
-- 3. RECRIA v_formulario e v_proposta_fabrica: ambas foram criadas com SELECT *
--    (expandido na criação), então colunas novas NÃO entram sozinhas — por isso
--    motivo_perda_obs sumia. Recriar reexpande o * e:
--      - v_formulario ganha motivo_perda_obs, termometro e fabrica_custo
--        (custo do pedido de fábrica vinculado, via id_fabrica_ref).
--      - v_proposta_fabrica ganha frete_modalidade/frete_valor.
--
-- Rodar ANTES do deploy da app. Em transação.
-- =====================================================================

BEGIN;

ALTER TABLE "Formulario" ADD COLUMN IF NOT EXISTS termometro smallint
  CHECK (termometro IS NULL OR (termometro >= 0 AND termometro <= 100));

ALTER TABLE "Proposta_Fabrica"
  ADD COLUMN IF NOT EXISTS frete_modalidade text
    CHECK (frete_modalidade IS NULL OR frete_modalidade IN ('incluso','nao_incluso')),
  ADD COLUMN IF NOT EXISTS frete_valor numeric(14,2);

-- ---- v_formulario (f.* + derivados + vendedor_nome + custo do pedido vinculado) ----
DROP VIEW IF EXISTS v_formulario;
CREATE VIEW v_formulario AS
SELECT f.*,
       CASE WHEN f.deleted_at IS NOT NULL THEN 'Lixeira' ELSE f.status END AS status_ui,
       round(extract(epoch from (now() - f.status_desde)) / 86400.0)::int AS dias_na_fase,
       round(extract(epoch from (now() - f.criado_em))   / 86400.0)::int AS dias_total,
       sp.cor_hex, sp.em_aberto, sp.ordem AS status_ordem, sp.probabilidade,
       vend.nome AS vendedor_nome,
       pf.custo AS fabrica_custo
  FROM "Formulario" f
  LEFT JOIN status_proposta sp ON sp.nome = f.status
  LEFT JOIN vendedores vend    ON vend.id = f.vendedor_id
  LEFT JOIN "Proposta_Fabrica" pf ON pf.id = nullif(f.id_fabrica_ref, '')::bigint;

-- ---- v_proposta_fabrica (pf.* — agora com frete_* — + aging/pasta) ----
DROP VIEW IF EXISTS v_proposta_fabrica;
CREATE VIEW v_proposta_fabrica AS
SELECT pf.*,
       round(extract(epoch from (now() - pf.status_desde)) / 86400.0)::int AS dias_na_fase,
       ff.cor_hex, ff.cor_pasta, ff.ordem AS fase_ordem, ff.eh_final,
       CASE WHEN pf.eta_fabrica IS NOT NULL AND pf.eta_fabrica < current_date
                 AND NOT coalesce(ff.eh_final, false)
            THEN current_date - pf.eta_fabrica END AS dias_atraso_eta
  FROM "Proposta_Fabrica" pf
  LEFT JOIN fase_fabrica ff ON ff.nome = pf.status
 WHERE pf.deleted_at IS NULL;

COMMIT;

-- Verificação:
--   SELECT id, termometro, motivo_perda_obs, fabrica_custo FROM v_formulario LIMIT 1;
--   SELECT id, custo, frete_modalidade, frete_valor FROM v_proposta_fabrica LIMIT 1;
