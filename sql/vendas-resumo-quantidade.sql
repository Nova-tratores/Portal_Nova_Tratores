-- ============================================================================
-- VENDAS — RESUMO COM QUANTIDADE (histórico da aba Máquinas)
--
-- A aba Máquinas conta UNIDADES = soma de vendas_itens.quantidade (a mesma
-- régua do card de máquinas, agregarMaquinas). As RPCs de resumo devolviam só
-- valor, custo, linhas e pedidos; aqui ganham a coluna `quantidade`.
--
--   vendas_resumo_mensal   : tabela → precisa DROP + CREATE (o tipo de retorno
--                            muda). vendas_resumo_mensal_json chama esta função
--                            e passa a devolver a coluna nova sozinha (to_jsonb).
--   vendas_resumo_semanal_json : CREATE OR REPLACE (devolve jsonb).
--
-- Sem esta migration a medida "Unidades" não aparece; o resto segue igual.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.vendas_resumo_mensal(int, text, text[]);

CREATE FUNCTION public.vendas_resumo_mensal(
  p_desde_ano int,
  p_conta text DEFAULT NULL,
  p_ignorar text[] DEFAULT '{}'
)
RETURNS TABLE (
  conta_omie text,
  ano int,
  mes int,
  familia text,
  tipo text,
  codigo_categoria text,
  valor numeric,
  custo numeric,
  quantidade numeric,
  linhas int,
  pedidos text[]
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    v.conta_omie,
    v.ano,
    v.mes,
    v.familia,
    v.tipo,
    v.codigo_categoria,
    COALESCE(SUM(v.valor_total), 0) AS valor,
    COALESCE(SUM(CASE WHEN v.cmc_unitario > 0 AND v.quantidade > 0 THEN v.cmc_unitario * v.quantidade ELSE 0 END), 0) AS custo,
    COALESCE(SUM(v.quantidade), 0) AS quantidade,
    COUNT(*)::int AS linhas,
    COALESCE(ARRAY_AGG(DISTINCT v.numero_pedido) FILTER (WHERE v.numero_pedido IS NOT NULL), '{}') AS pedidos
  FROM public.vendas_itens v
  WHERE v.ano >= p_desde_ano
    AND (p_conta IS NULL OR v.conta_omie = p_conta)
    AND (cardinality(p_ignorar) = 0 OR v.codigo_cliente <> ALL (p_ignorar))
  GROUP BY v.conta_omie, v.ano, v.mes, v.familia, v.tipo, v.codigo_categoria;
$$;

REVOKE ALL ON FUNCTION public.vendas_resumo_mensal(int, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendas_resumo_mensal(int, text, text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.vendas_resumo_semanal_json(
  p_desde date,
  p_conta text DEFAULT NULL,
  p_ignorar text[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH base AS (
    SELECT v.*, COALESCE(NULLIF(v.data_faturamento, ''), v.data_pedido) AS dref
    FROM public.vendas_itens v
    WHERE (p_conta IS NULL OR v.conta_omie = p_conta)
      AND (cardinality(p_ignorar) = 0 OR v.codigo_cliente <> ALL (p_ignorar))
  ), dias AS (
    SELECT b.*, to_date(b.dref, 'DD/MM/YYYY') AS dia
    FROM base b
    WHERE b.dref ~ '^\d{2}/\d{2}/\d{4}$'
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
  FROM (
    SELECT
      d.conta_omie,
      to_char(date_trunc('week', d.dia), 'YYYY-MM-DD') AS semana,
      d.familia, d.tipo, d.codigo_categoria,
      COALESCE(SUM(d.valor_total), 0) AS valor,
      COALESCE(SUM(CASE WHEN d.cmc_unitario > 0 AND d.quantidade > 0 THEN d.cmc_unitario * d.quantidade ELSE 0 END), 0) AS custo,
      COALESCE(SUM(d.quantidade), 0) AS quantidade,
      COUNT(*)::int AS linhas,
      COALESCE(ARRAY_AGG(DISTINCT d.numero_pedido) FILTER (WHERE d.numero_pedido IS NOT NULL), '{}') AS pedidos
    FROM dias d
    WHERE d.dia >= p_desde
    GROUP BY d.conta_omie, date_trunc('week', d.dia), d.familia, d.tipo, d.codigo_categoria
  ) r;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
