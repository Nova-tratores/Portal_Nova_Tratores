-- ============================================================================
-- Módulo "Sugestão de pedido de compra de peças" — tabelas base (v1).
--
-- Substitui a compra por feeling por uma sugestão calculada, quinzenal, por
-- fornecedor. Ver desenho em docs/inventario-modulo-sugestao-compra.md e no
-- plano de arquitetura. Segue a convenção da área de Estoque:
--   - SEM RLS (acesso via API route + service role; escrita nunca do cliente);
--   - conta_omie em MINÚSCULO ('nova'/'castro'), igual à tabela `produtos`;
--   - SEM FK formal (vínculos por convenção, como recebimento_meta);
--   - idempotente. Executar 1× no SQL Editor do Supabase.
--
-- Decisões travadas (v1):
--   - Fornecedor é chaveado por Fornecedores.id (PK interno), NÃO pelo código
--     Omie: um fornecedor tem id_omie E id_omie_castro (código por conta). O
--     código Omie é derivado só ao exibir/enviar, escolhendo a coluna da conta.
--   - Snapshot é CONSOLIDADO por SKU (produtos.codigo): codigo_produto diverge
--     100% entre NOVA e CASTRO (verificado). Guarda o codigo_produto de cada
--     conta em colunas para drill.
--   - Sem push Omie na v1: pedido_compra.codigo_omie fica reservado (nullable).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) pedido_compra — cabeçalho do pedido (nasce ao exportar a sugestão).
-- ----------------------------------------------------------------------------
create table if not exists public.pedido_compra (
  id                bigserial   primary key,
  conta_omie        text        not null,                  -- nova/castro (quem compra)
  codigo_fornecedor bigint,                                -- = Fornecedores.id; NULL = a definir (v1)
  data_pedido       date        not null default current_date,
  status            text        not null default 'rascunho'
                    check (status in ('rascunho','enviado','recebido_parcial','concluido','nao_atendido')),
  snapshot_id       uuid,                                  -- snapshot que gerou a sugestão (reprodutível)
  codigo_omie       bigint,                                -- reservado p/ push futuro (IncluirPedCompra)
  observacao        text,
  criado_por        uuid,                                  -- auth.users / financeiro_usu (token)
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);
create index if not exists idx_pedido_compra_status
  on public.pedido_compra (conta_omie, status);
create index if not exists idx_pedido_compra_fornecedor
  on public.pedido_compra (conta_omie, codigo_fornecedor, data_pedido);

-- ----------------------------------------------------------------------------
-- 2) pedido_compra_item — linhas do pedido.
-- qtd_sugerida e qtd_pedida são guardadas SEPARADAS de propósito: o desvio
-- acumulado entre as duas é o melhor diagnóstico de erro do modelo.
-- ----------------------------------------------------------------------------
create table if not exists public.pedido_compra_item (
  id             bigserial primary key,
  pedido_id      bigint    not null,                       -- = pedido_compra.id
  codigo_produto bigint    not null,                       -- id interno Omie na conta do pedido
  qtd_sugerida   numeric   not null default 0,             -- o que o sistema propôs
  qtd_pedida     numeric   not null default 0,             -- o que o comprador decidiu
  qtd_recebida   numeric   not null default 0,             -- somatório do vínculo de recebimento
  preco_estimado numeric,
  status_linha   text      not null default 'aberta'
                 check (status_linha in ('aberta','parcial','atendida','nao_atendida'))
);
create index if not exists idx_pedido_item_pedido
  on public.pedido_compra_item (pedido_id);
create index if not exists idx_pedido_item_produto
  on public.pedido_compra_item (codigo_produto, status_linha);

-- ----------------------------------------------------------------------------
-- 3) pedido_recebimento_vinculo — casa uma nota recebida a uma linha de pedido.
-- Camada NOSSA sobre recebimentos_nfe (tabela externa, sem CREATE aqui), no
-- mesmo padrão de recebimento_meta. Uma nota atende vários pedidos e um pedido
-- é atendido por várias notas — a tabela resolve os dois casos.
-- ----------------------------------------------------------------------------
create table if not exists public.pedido_recebimento_vinculo (
  id                  bigserial   primary key,
  conta_omie          text        not null,
  id_receb            bigint,                              -- = recebimentos_nfe.id_receb; NULL = recebimento manual
  codigo_produto      bigint      not null,
  pedido_item_id      bigint      not null,                -- = pedido_compra_item.id
  qtd_vinculada       numeric     not null default 0,
  data_entrada_estoque date,                               -- data REAL da entrada (não da emissão)
  vinculado_por       uuid,
  criado_em           timestamptz not null default now(),
  unique (conta_omie, id_receb, codigo_produto, pedido_item_id)
);
create index if not exists idx_pedido_vinculo_pedido_item
  on public.pedido_recebimento_vinculo (pedido_item_id);
create index if not exists idx_pedido_vinculo_receb
  on public.pedido_recebimento_vinculo (conta_omie, id_receb);

-- ----------------------------------------------------------------------------
-- 4) fornecedor_param — parâmetros de suprimento por fornecedor e conta.
-- regularidade vira CV do lead time enquanto não houver 8 entregas medidas:
--   regular=15% / irregular=30% / muito_irregular=50% do lead time declarado.
-- ----------------------------------------------------------------------------
create table if not exists public.fornecedor_param (
  conta_omie          text    not null,
  codigo_fornecedor   bigint  not null,                    -- = Fornecedores.id
  lead_time_declarado int,                                 -- dias
  regularidade        text    default 'regular'
                      check (regularidade in ('regular','irregular','muito_irregular')),
  ciclo_dias          int     default 15,                  -- 15 na fábrica principal
  nivel_servico_a     numeric,                             -- override da matriz padrão
  nivel_servico_b     numeric,
  nivel_servico_c     numeric,
  pedido_minimo_valor numeric,
  ativo               boolean not null default true,
  atualizado_em       timestamptz not null default now(),
  atualizado_por      uuid,
  primary key (conta_omie, codigo_fornecedor)
);

-- ----------------------------------------------------------------------------
-- 5) item_param — parâmetros por item e conta (override da cascata forn→tipo→item).
-- codigo_fornecedor_preferencial default virá do backfill de
-- produtos.ultima_entrada_fornecedor (job); aqui o valor manual VENCE.
-- ----------------------------------------------------------------------------
create table if not exists public.item_param (
  conta_omie                     text    not null,
  codigo_produto                 bigint  not null,         -- id interno Omie na conta
  codigo_fornecedor_preferencial bigint,                  -- = Fornecedores.id
  lead_time_override             int,
  multiplo_embalagem             numeric not null default 1,
  minimo_manual                  numeric,
  minimo_manual_motivo           text,                     -- obrigatório na app quando há mínimo manual
  minimo_manual_validade         date,                     -- obrigatório: mínimo sem validade apodrece
  critico                        boolean not null default false,  -- força nível de serviço 98%
  sob_encomenda                  boolean not null default false,  -- nunca entra na sugestão automática
  atualizado_em                  timestamptz not null default now(),
  atualizado_por                 uuid,
  primary key (conta_omie, codigo_produto)
);
create index if not exists idx_item_param_fornecedor
  on public.item_param (conta_omie, codigo_fornecedor_preferencial);

-- ----------------------------------------------------------------------------
-- 6) sugestao_compra_snapshot — 1 linha por SKU por rodada, CONSOLIDADA.
-- É o que a tela lê. NOVA e CASTRO entram como colunas de detalhe; se um dia
-- forem cinco contas, vira tabela filha. estoque_atual/em_transito são
-- recalculados ao vivo na leitura; o resto vem desta captura.
-- ----------------------------------------------------------------------------
create table if not exists public.sugestao_compra_snapshot (
  -- identificação
  snapshot_id          uuid        not null,
  gerado_em            timestamptz not null default now(),
  sku                  text        not null,               -- = produtos.codigo (chave comum entre contas)
  codigo_produto_nova  bigint,
  codigo_produto_castro bigint,
  descricao            text,
  marca                text,
  familia              text,
  tipo                 text,
  codigo_fornecedor    bigint,                             -- = Fornecedores.id (preferencial)
  -- detalhe por conta
  estoque_nova         numeric,
  estoque_castro       numeric,
  cmd_nova             numeric,                            -- consumo médio diário
  cmd_castro           numeric,
  dias_ruptura_nova    numeric,
  dias_ruptura_castro  numeric,
  -- classificação
  curva                text        check (curva in ('A','B','C')),
  curva_calculada_em   timestamptz,
  frequencia           text,                               -- alta/media/baixa
  meses_com_saida_12m  int,
  regime               text,                               -- estatistico/intermitente/sem_historico
  -- demanda
  cmd                  numeric,                            -- consumo médio diário dessazonalizado (pool)
  sigma_demanda        numeric,
  indice_sazonal_45d   numeric,
  demanda_45d          numeric,
  revisoes_45d         numeric     not null default 0,     -- reservado; sempre 0 na v1
  dias_ruptura_12m     numeric,
  fator_censura        numeric,
  -- suprimento
  lead_time_usado      int,
  lead_time_origem     text        check (lead_time_origem in ('declarado','medido')),
  sigma_lead           numeric,
  entregas_medidas     int,
  -- resultado
  nivel_servico        numeric,
  estoque_seguranca    numeric,
  minimo_efetivo       numeric,
  minimo_origem        text        check (minimo_origem in ('calculado','manual')),
  estoque_atual        numeric,                            -- recalculado ao vivo na leitura
  em_transito          numeric,                            -- recalculado ao vivo na leitura
  prev_30              numeric,
  prev_60              numeric,
  prev_90              numeric,
  qtd_sugerida_bruta   numeric,
  qtd_sugerida         numeric,                            -- arredondada ao múltiplo
  valor_estimado       numeric,
  alerta               text        check (alerta in ('ja_era','critico','atencao','ok','nao_comprar')),
  primary key (snapshot_id, sku)
);
create index if not exists idx_sugestao_snapshot_rodada
  on public.sugestao_compra_snapshot (snapshot_id, codigo_fornecedor);
create index if not exists idx_sugestao_snapshot_gerado
  on public.sugestao_compra_snapshot (gerado_em desc);
