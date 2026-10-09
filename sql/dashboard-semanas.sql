-- ============================================================================
-- DASHBOARD DE VENDAS — RESUMO POR SEMANA (vista "Semanas" do histórico)
--
-- Mesmas somas das RPCs mensais (vendas-resumo-mensal.sql e
-- servicos-codigo-resumo.sql), agrupadas pela SEMANA (segunda-feira,
-- date_trunc('week')) do dia de referência:
--   vendas   : data_faturamento (dFat) e, sem ela, data_pedido — 'DD/MM/AAAA'
--   serviços : os_servicos_itens.data (faturamento da OS) — 'DD/MM/AAAA'
-- Texto que não é data válida fica de fora (o regex evita erro no to_date).
-- Devolve jsonb (uma ida só; não sofre o corte de 1000 linhas do PostgREST).
--
-- Chamadas só pelo servidor (service role), atrás do login da tela. Sem esta
-- migration a vista Semanas não aparece; nada quebra.
-- ============================================================================

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
      COUNT(*)::int AS linhas,
      COALESCE(ARRAY_AGG(DISTINCT d.numero_pedido) FILTER (WHERE d.numero_pedido IS NOT NULL), '{}') AS pedidos
    FROM dias d
    WHERE d.dia >= p_desde
    GROUP BY d.conta_omie, date_trunc('week', d.dia), d.familia, d.tipo, d.codigo_categoria
  ) r;
$$;

CREATE OR REPLACE FUNCTION public.servicos_resumo_semanal_json(
  p_desde date,
  p_conta text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH itens AS (
    SELECT
      i.conta_omie, i.ncod_os, i.valor_total,
      to_date(i.data, 'DD/MM/YYYY') AS dia,
      CASE
        WHEN i.codigo_servico = 0 THEN 'SEM_CODIGO'
        WHEN i.tipo IN ('HR', 'KM') THEN i.tipo
        ELSE 'OUTRO'
      END AS tipo
    FROM public.os_servicos_itens i
    JOIN public.os_nfse n
      ON n.ncod_os = i.ncod_os AND n.conta_omie = i.conta_omie AND n.tem_nota
    WHERE (p_conta IS NULL OR i.conta_omie = p_conta)
      AND i.data ~ '^\d{2}/\d{2}/\d{4}$'
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
  FROM (
    SELECT conta_omie, to_char(date_trunc('week', dia), 'YYYY-MM-DD') AS semana, tipo,
           COALESCE(SUM(valor_total), 0) AS valor,
           COUNT(*)::int AS itens,
           ARRAY_AGG(DISTINCT ncod_os) AS os
    FROM itens
    WHERE dia >= p_desde
    GROUP BY conta_omie, date_trunc('week', dia), tipo
  ) r;
$$;

REVOKE ALL ON FUNCTION public.vendas_resumo_semanal_json(date, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendas_resumo_semanal_json(date, text, text[]) TO service_role;
REVOKE ALL ON FUNCTION public.servicos_resumo_semanal_json(date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.servicos_resumo_semanal_json(date, text) TO service_role;

NOTIFY pgrst, 'reload schema';
