-- =====================================================================
-- Nova Tratores — /propostas: vínculo com vendedor (item 1)
-- Data: 2026-08-21
--
-- Corrige o TIPO de vendedor_id: a evolução criou vendedor_id como `uuid`
-- (supondo "dono = usuário de login"), mas a lista real de vendedores
-- (tabela public.vendedores, alimentada em /gestao-vendas/ajustes-venda)
-- usa `id` INTEIRO. Aqui trocamos uuid -> bigint e expomos vendedor_nome
-- em v_formulario. A coluna estava VAZIA, então a troca é segura.
--
-- Rode DEPOIS de sql/propostas-evolucao.sql. Em transação; ROLLBACK se falhar.
-- =====================================================================

BEGIN;

-- 1. Derruba as views que dependem da coluna (serão recriadas idênticas;
--    v_formulario ganha vendedor_nome).
DROP VIEW IF EXISTS v_forecast;
DROP VIEW IF EXISTS v_fila_acao;
DROP VIEW IF EXISTS v_formulario;
DROP VIEW IF EXISTS v_proposta_fabrica;

-- 2. Troca o tipo uuid -> bigint (USING NULL: coluna vazia). Reindexação.
DROP INDEX IF EXISTS ix_form_vendedor;
ALTER TABLE "Formulario"       ALTER COLUMN vendedor_id TYPE bigint USING NULL;
ALTER TABLE "Proposta_Fabrica" ALTER COLUMN vendedor_id TYPE bigint USING NULL;
CREATE INDEX ix_form_vendedor ON "Formulario"(vendedor_id);
CREATE INDEX IF NOT EXISTS ix_pf_vendedor ON "Proposta_Fabrica"(vendedor_id);
-- FK opcional: descomente se vendedores.id for PK/único no seu banco.
-- ALTER TABLE "Formulario" ADD CONSTRAINT fk_form_vendedor
--   FOREIGN KEY (vendedor_id) REFERENCES vendedores(id);

-- 3. Recria as views. v_formulario agora resolve o NOME do vendedor.
CREATE VIEW v_formulario AS
SELECT f.*,
       CASE WHEN f.deleted_at IS NOT NULL THEN 'Lixeira' ELSE f.status END AS status_ui,
       round(extract(epoch from (now() - f.status_desde)) / 86400.0)::int AS dias_na_fase,
       round(extract(epoch from (now() - f.criado_em))   / 86400.0)::int AS dias_total,
       sp.cor_hex, sp.em_aberto, sp.ordem AS status_ordem, sp.probabilidade,
       vend.nome AS vendedor_nome
  FROM "Formulario" f
  LEFT JOIN status_proposta sp ON sp.nome = f.status
  LEFT JOIN vendedores vend    ON vend.id = f.vendedor_id;

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

CREATE VIEW v_forecast AS
SELECT f.id, f."Cliente", f.vendedor_id, f.status,
       coalesce(f.valor_bruto - f.desconto_total, nt_num(f."Valor_Total"::text)) AS valor,
       f.margem_prevista, f.previsao_fechamento,
       sp.probabilidade,
       coalesce(f.valor_bruto - f.desconto_total, nt_num(f."Valor_Total"::text))
         * sp.probabilidade AS valor_ponderado
  FROM "Formulario" f
  JOIN status_proposta sp ON sp.nome = f.status AND sp.em_aberto = true
 WHERE f.deleted_at IS NULL;

CREATE VIEW v_fila_acao AS
SELECT f.id, f."Cliente", f.status, f.vendedor_id, f.proximo_contato,
       round(extract(epoch from (now() - f.status_desde)) / 86400.0)::int AS dias_parado,
       CASE WHEN f.proximo_contato < current_date THEN 'contato vencido'
            WHEN round(extract(epoch from (now() - f.status_desde)) / 86400.0) > 15 THEN 'parado +15d'
            WHEN f.proximo_contato IS NULL THEN 'sem próximo contato'
       END AS motivo
  FROM "Formulario" f
  JOIN status_proposta sp ON sp.nome = f.status AND sp.em_aberto = true
 WHERE f.deleted_at IS NULL
   AND (f.proximo_contato < current_date
        OR f.proximo_contato IS NULL
        OR now() - f.status_desde > interval '15 days');

COMMIT;

-- =====================================================================
-- VERIFICAÇÃO
-- =====================================================================
--   SELECT data_type FROM information_schema.columns
--    WHERE table_name='Formulario' AND column_name='vendedor_id';   -- bigint
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='v_formulario' AND column_name='vendedor_nome'; -- 1 linha
--   -- teste: vincular e ver o nome
--   -- UPDATE "Formulario" SET vendedor_id=(SELECT id FROM vendedores WHERE ativo LIMIT 1) WHERE id=<id>;
--   -- SELECT id, vendedor_id, vendedor_nome FROM v_formulario WHERE id=<id>;
