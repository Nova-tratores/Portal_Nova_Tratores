-- ============================================================================
-- Enriquecimento do produto (tela "Item de Orçamento" do PPV + modal de detalhe)
-- Estratégia LAZY-FILL: lê do banco; se faltar/estiver velho (enriquecido_em),
-- busca no Omie 1x, SALVA aqui e mostra. Sem carga pesada nem cron.
--
-- Fontes ao vivo que passam a ser persistidas aqui:
--  - NCM + descrição detalhada        -> Omie ConsultarProduto
--  - CFOP de garantia + últ. custo gar -> /api/ajustes/analise (cálculo pesado)
--  - Última entrada (mov. de estoque)  -> Omie movimentação (obterMovimentacaoProduto)
--
-- Rodar no Supabase (idempotente).
-- ============================================================================

alter table produtos add column if not exists ncm text;
alter table produtos add column if not exists descricao_detalhada text;
alter table produtos add column if not exists ultima_entrada_data date;
alter table produtos add column if not exists ultima_entrada_fornecedor text;
alter table produtos add column if not exists ultima_entrada_nf text;
alter table produtos add column if not exists ultima_entrada_qtde numeric;
alter table produtos add column if not exists ultima_entrada_custo numeric;
alter table produtos add column if not exists cfop_garantia text[];
alter table produtos add column if not exists ultimo_custo_garantia numeric;
alter table produtos add column if not exists enriquecido_em timestamptz;
