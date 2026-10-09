-- ============================================================================
-- SERVIÇOS — CÓDIGO DO SERVIÇO + RESUMO MENSAL POR TIPO (Dashboard de Vendas)
--
-- A grade de Serviços passa a separar o valor COM NFS-e por tipo de serviço:
--   HR          Hora Trabalhada
--   KM          Deslocamento por KM
--   SEM_CODIGO  item digitado na OS sem serviço cadastrado (nCodServico = 0)
--               ou OS sem itens detalhados
--   OUTRO       demais serviços cadastrados (retífica, revisões, …)
-- Tudo sai dos ITENS das OS (os_servicos_itens) com tem_nota em os_nfse, então
-- os 4 tipos somam o total da grade. (O card Serviços usa o cabeçalho da OS em
-- os_mensal — pode diferir alguns reais.)
--
--   os_servicos_itens.codigo_servico  bigint = nCodServico da Omie (0 = sem
--     código). NULL nas linhas antigas até o reprocessamento (backfillOsServicos
--     forçado); enquanto NULL, o item cai no tipo calculado pela descrição.
--   servicos_resumo_mensal_json(desde_ano, conta) → jsonb com uma linha por
--     conta × ano × mês × tipo: valor, itens (linhas) e os (ncod_os distintos —
--     para contar OS sem repetir a que tem HR e KM).
--
-- Chamada só pelo servidor (service role), atrás do login da tela. Sem esta
-- migration o sync grava sem o código e a grade de Serviços mostra só o total.
-- ============================================================================

ALTER TABLE public.os_servicos_itens ADD COLUMN IF NOT EXISTS codigo_servico bigint;

CREATE OR REPLACE FUNCTION public.servicos_resumo_mensal_json(
  p_desde_ano int,
  p_conta text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH itens AS (
    SELECT
      i.conta_omie, i.ano, i.mes, i.ncod_os, i.valor_total,
      CASE
        WHEN i.codigo_servico = 0 THEN 'SEM_CODIGO'
        WHEN i.tipo IN ('HR', 'KM') THEN i.tipo
        ELSE 'OUTRO'
      END AS tipo
    FROM public.os_servicos_itens i
    JOIN public.os_nfse n
      ON n.ncod_os = i.ncod_os AND n.conta_omie = i.conta_omie AND n.tem_nota
    WHERE i.ano >= p_desde_ano
      AND (p_conta IS NULL OR i.conta_omie = p_conta)
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
  FROM (
    SELECT conta_omie, ano, mes, tipo,
           COALESCE(SUM(valor_total), 0) AS valor,
           COUNT(*)::int AS itens,
           ARRAY_AGG(DISTINCT ncod_os) AS os
    FROM itens
    GROUP BY conta_omie, ano, mes, tipo
  ) r;
$$;

REVOKE ALL ON FUNCTION public.servicos_resumo_mensal_json(int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.servicos_resumo_mensal_json(int, text) TO service_role;

NOTIFY pgrst, 'reload schema';
