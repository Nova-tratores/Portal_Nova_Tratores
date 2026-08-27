-- Livro-razão de movimentos de estoque da Omie (método MovimentoEstoque), por item.
-- É a fonte CORRETA para reconciliar o estoque: cada movimento carrega o CMC antes
-- e depois, então o efeito no VALOR do estoque é exato:
--   efeito = qtde_atual*cmc_atual - qtde_anterior*cmc_anterior
-- e a soma dos efeitos de um período FECHA a variação do valor de estoque, decomposta
-- por tipo de movimento (cod_origem: COM compra, VEN venda, AJU ajuste, REM remessa,
-- CTR frete, DVP/DCP devoluções, RRE nota de entrada, ...).
--
-- Substitui, na aba Reconciliação do Cruzamento por Família, o snapshot mensal
-- (capturado em instante arbitrário → não fechava). conta_omie em MINÚSCULO
-- ('nova'/'castro'), igual à tabela `produtos`. Aplicar no SQL editor do Supabase
-- (idempotente). Backfill/cron via scripts/estoque-movimentos-backfill.ts.

create table if not exists public.estoque_movimentos (
  mov_hash        text        primary key,           -- hash estável do movimento (idempotência)
  conta_omie      text        not null,
  codigo_produto  bigint      not null,              -- id interno Omie (id_prod)
  familia         text,                              -- família do produto (p/ agregar)
  grupo           text,                              -- 'peca' | 'maquina' | 'ignorar'
  data            date        not null,
  ano             int         not null,
  mes             int         not null,
  cod_origem      text,                              -- COM/VEN/AJU/REM/CTR/DVP/DCP/RRE/...
  des_origem      text,
  num_doc         text,
  qtde_anterior   numeric     not null default 0,
  cmc_anterior    numeric     not null default 0,
  qtde_atual      numeric     not null default 0,
  cmc_atual       numeric     not null default 0,
  qtde_entrada    numeric     not null default 0,
  qtde_saida      numeric     not null default 0,
  efeito          numeric     not null default 0,    -- qtde_atual*cmc_atual - qtde_anterior*cmc_anterior
  bucket          text,                              -- compra|venda|ajuste|remessa|frete|devolucao_venda|devolucao_compra|retorno|outro
  cancelado       boolean     not null default false,
  sincronizado_em timestamptz not null default now()
);

-- Agregação da Reconciliação: por conta+grupo+período.
create index if not exists idx_estoque_movimentos_recon
  on public.estoque_movimentos (conta_omie, grupo, ano, mes);

-- Backfill/checkpoint por produto e leitura por item.
create index if not exists idx_estoque_movimentos_produto
  on public.estoque_movimentos (conta_omie, codigo_produto);

-- Progresso do backfill por produto (evita re-puxar quem já foi; retomável).
create table if not exists public.estoque_movimentos_sync (
  conta_omie      text        not null,
  codigo_produto  bigint      not null,
  ultima_data     date,                              -- fim da janela já sincronizada
  movimentos      int         not null default 0,
  sincronizado_em timestamptz not null default now(),
  primary key (conta_omie, codigo_produto)
);
