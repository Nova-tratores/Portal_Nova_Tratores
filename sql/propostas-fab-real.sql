-- =====================================================================
-- Nova Tratores — /propostas: FAB = vínculo com pedido de fábrica REAL
-- Data: 2026-08-24
--
-- PROBLEMA: id_fabrica_ref (texto) foi preenchido em ~31 propostas com
-- valores que NÃO são id de Proposta_Fabrica (apontam p/ outras propostas/
-- pedidos de venda). A badge FAB aparecia p/ qualquer id_fabrica_ref != ''
-- → falso positivo. Só existe 1 pedido de fábrica (id 6, proposta #22).
--
-- FIX: expõe fabrica_pedido_id (pf.id do join) na v_formulario. O app passa
-- a considerar FAB só quando fabrica_pedido_id != null (pedido existe e não
-- deletado). id_fabrica_ref é PRESERVADO (não apagamos nada).
--
-- Rodar ANTES do deploy. Em transação.
-- =====================================================================

BEGIN;

DROP VIEW IF EXISTS v_formulario;
CREATE VIEW v_formulario AS
SELECT f.*,
       CASE WHEN f.deleted_at IS NOT NULL THEN 'Lixeira' ELSE f.status END AS status_ui,
       round(extract(epoch from (now() - f.status_desde)) / 86400.0)::int AS dias_na_fase,
       round(extract(epoch from (now() - f.criado_em))   / 86400.0)::int AS dias_total,
       sp.cor_hex, sp.em_aberto, sp.ordem AS status_ordem, sp.probabilidade,
       vend.nome AS vendedor_nome,
       pf.custo AS fabrica_custo,
       pf.id    AS fabrica_pedido_id      -- null se id_fabrica_ref não aponta p/ pedido real
  FROM "Formulario" f
  LEFT JOIN status_proposta sp ON sp.nome = f.status
  LEFT JOIN vendedores vend    ON vend.id = f.vendedor_id
  LEFT JOIN "Proposta_Fabrica" pf
    ON pf.id = nullif(f.id_fabrica_ref, '')::bigint AND pf.deleted_at IS NULL;

COMMIT;

-- Verificação (deve dar 1: só a proposta #22 é FAB real):
--   SELECT count(*) FROM v_formulario WHERE fabrica_pedido_id IS NOT NULL AND deleted_at IS NULL;
--   SELECT id, id_fabrica_ref, fabrica_pedido_id FROM v_formulario WHERE id_fabrica_ref <> '' LIMIT 20;
