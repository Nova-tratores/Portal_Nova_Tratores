-- ============================================================================
-- VENDAS — RESUMO MENSAL NO BANCO (Dashboard de Vendas, histórico/grade)
--
-- O histórico de um card lia ~25 mil linhas cruas de vendas_itens pela REST
-- (páginas de 1000) e somava em JS a cada abertura (~5 s). Esta RPC devolve a
-- soma JÁ AGRUPADA por conta × ano × mês × família × tipo × categoria contábil
-- (alguns milhares de linhas). A classificação em cards (peça/máquina, Filtros,
-- Lubrificantes, tipo…) continua no código (agregarCardsPecas), então os
-- números seguem a mesma régua dos cards.
--
--   custo   = Σ cmc_unitario × quantidade, só quando os dois são > 0 (igual ao card)
--   pedidos = números de pedido distintos do grupo (ticket médio por card)
--   p_ignorar = códigos de cliente de `ignorar_clientes`; mesma semântica do
--               NOT IN do card (linha sem cliente também sai quando há lista).
--
-- Chamada só pelo servidor (service role) em /api/estoque/dashboard/historico,
-- que já exige login + permissão da tela. Sem esta migration a rota volta ao
-- caminho antigo (lento), nada quebra.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.vendas_resumo_mensal(
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

NOTIFY pgrst, 'reload schema';
