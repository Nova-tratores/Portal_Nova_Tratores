-- ============================================================================
-- VENDAS — RESUMO MENSAL EM UMA IDA SÓ (complemento de vendas-resumo-mensal.sql)
--
-- A RPC em tabela devolve ~3.300 linhas; o PostgREST corta em 1000 por
-- resposta, então eram 4 chamadas e o banco refazia a soma inteira em cada uma
-- (~2 s no total). Esta versão devolve o MESMO resultado como um único jsonb
-- (não sofre o corte de linhas): 1 consulta, 1 ida e volta.
-- Mesmos parâmetros, mesma permissão (só service role).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.vendas_resumo_mensal_json(
  p_desde_ano int,
  p_conta text DEFAULT NULL,
  p_ignorar text[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
  FROM public.vendas_resumo_mensal(p_desde_ano, p_conta, p_ignorar) r;
$$;

REVOKE ALL ON FUNCTION public.vendas_resumo_mensal_json(int, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendas_resumo_mensal_json(int, text, text[]) TO service_role;

NOTIFY pgrst, 'reload schema';
