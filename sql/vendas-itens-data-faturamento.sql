-- ============================================================================
-- VENDAS_ITENS — DATA DE FATURAMENTO + ÍNDICE POR PEDIDO
--
-- O espelho vendas_itens (Dashboard de Vendas, /estoque/dashboard) gravava em
-- mes/ano a JANELA consultada na Omie. O ListarPedidos devolve o pedido
-- incluído OU ALTERADO na janela, então pedido alterado depois de faturado era
-- regravado no mês da alteração e ficava DUPLICADO (auditoria 08/10/2026:
-- 29 pares, R$ 14,9 mil; 156 linhas com mes/ano diferente da data do pedido).
--
-- Agora o mês de cada pedido é o do FATURAMENTO (infoCadastro.dFat; sem ele,
-- previsão → inclusão = data_pedido) — regra em src/lib/estoque/vendas-referencia.ts.
-- Ao regravar, o pedido é apagado INTEIRO por número (em qualquer mês).
--
--   data_faturamento  text 'DD/MM/AAAA' (mesmo formato de data_pedido). Usada
--                     no corte "period-to-date" do mês corrente. NULL nas
--                     linhas antigas até o próximo resync do mês.
--   índice (conta_omie, numero_pedido) — o DELETE por número roda a cada sync.
--
-- O deploy NÃO depende desta migration: sem a coluna, o sync grava sem ela e a
-- leitura cai em data_pedido.
-- ============================================================================

ALTER TABLE public.vendas_itens ADD COLUMN IF NOT EXISTS data_faturamento text;

CREATE INDEX IF NOT EXISTS vendas_itens_conta_pedido_idx
  ON public.vendas_itens (conta_omie, numero_pedido);

NOTIFY pgrst, 'reload schema';
