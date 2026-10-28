-- =====================================================================
-- Boleto agrupado de fornecedor (28/10/2026)
--
-- Fornecedores como a CAMBUCI mandam UM boleto parcelado cobrindo várias
-- NF-e. Até aqui o financeiro "pagava" as duplicatas da NF na Omie com
-- desconto de 100 % e criava títulos manuais com as parcelas do boleto
-- (compra contada 2× por emissão, desconto falso, NF↔boleto em texto livre).
--
-- Regra nova: o boleto REPROGRAMA as duplicatas (vencimento/previsão =
-- parcela do boleto, observação com nº do boleto e NFs) e a baixa só acontece
-- no pagamento real, duplicata a duplicata. Estas tabelas guardam o boleto,
-- as parcelas e qual duplicata caiu em qual parcela (o que foi escrito na
-- Omie fica em contas_correcoes / contas_baixas, como sempre).
--
-- RLS ligada SEM policy + REVOKE: só o service role (rotas
-- /api/ajustes/boletos-fornecedor/*) lê e escreve.
-- Rode no SQL Editor do Supabase. Idempotente.
-- =====================================================================

-- Fornecedores que cobram por boleto agrupado (liga avisos e tolerâncias).
create table if not exists public.fornecedores_regra_boleto (
  id                        uuid primary key default gen_random_uuid(),
  conta_omie                text not null check (conta_omie in ('NOVA', 'CASTRO')),
  codigo_cliente_fornecedor bigint not null,
  nome                      text not null,
  ativo                     boolean not null default true,
  dias_tolerancia           int not null default 10,          -- duplicata aberta sem boleto há mais que isto = "aguardando boleto"
  tolerancia_valor          numeric(12,2) not null default 1.00, -- |soma das parcelas - soma das duplicatas| aceita
  alinhar_vencimento        boolean not null default true,    -- além da previsão, muda também o vencimento na Omie
  criado_por                text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (conta_omie, codigo_cliente_fornecedor)
);

create table if not exists public.boletos_fornecedor (
  id                        uuid primary key default gen_random_uuid(),
  conta_omie                text not null check (conta_omie in ('NOVA', 'CASTRO')),
  codigo_cliente_fornecedor bigint,
  nome_fornecedor           text not null,
  numero                    text not null check (char_length(numero) between 1 and 60),
  codigo_barras             text check (char_length(codigo_barras) <= 70),
  data_emissao              date,
  valor_total               numeric(12,2) not null,           -- soma das parcelas
  valor_titulos             numeric(12,2) not null,           -- soma das duplicatas cobertas
  status                    text not null default 'pendente'
                            check (status in ('pendente', 'registrado', 'parcial', 'pago', 'cancelado', 'erro_omie')),
  alinhar_vencimento        boolean not null default true,
  observacao                text,
  erro                      text,
  criado_por                text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists boletos_fornecedor_conta_status_idx on public.boletos_fornecedor (conta_omie, status);
create index if not exists boletos_fornecedor_fornecedor_idx on public.boletos_fornecedor (conta_omie, codigo_cliente_fornecedor);

create table if not exists public.boleto_parcelas (
  id                    uuid primary key default gen_random_uuid(),
  boleto_id             uuid not null references public.boletos_fornecedor(id) on delete cascade,
  numero                int not null,                         -- 1..total
  total                 int not null,
  data_vencimento       date not null,
  valor                 numeric(12,2) not null,
  status                text not null default 'aberta' check (status in ('aberta', 'paga', 'cancelada')),
  pago_em               date,
  codigo_conta_corrente bigint,
  baixa_ids             bigint[] not null default '{}',       -- contas_baixas.id de cada duplicata baixada
  created_at            timestamptz not null default now(),
  unique (boleto_id, numero)
);

-- Qual duplicata (título COMP da Omie) caiu em qual parcela, com quanto.
-- Uma duplicata pode cair em 2 parcelas (valor_alocado parcial em cada).
create table if not exists public.boleto_titulos (
  id                    uuid primary key default gen_random_uuid(),
  boleto_id             uuid not null references public.boletos_fornecedor(id) on delete cascade,
  parcela_id            uuid not null references public.boleto_parcelas(id) on delete cascade,
  conta_omie            text not null,
  codigo_lancamento     bigint not null,
  numero_documento      text,
  numero_documento_fiscal text,
  valor_titulo          numeric(12,2) not null,
  valor_alocado         numeric(12,2) not null,
  principal             boolean not null default true,        -- parcela onde cai a maior parte (é a que vai pra Omie)
  status                text not null default 'pendente'
                        check (status in ('pendente', 'aplicado', 'erro', 'baixado', 'estornado')),
  erro                  text,
  correcao_id           bigint,                               -- contas_correcoes.id da reprogramação
  snapshot_anterior     jsonb,                                -- {dataVencimento, dataPrevisao, observacao} antes
  campos_novos          jsonb,                                -- o que foi mandado para a Omie
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (boleto_id, parcela_id, codigo_lancamento)
);
create index if not exists boleto_titulos_lanc_idx on public.boleto_titulos (conta_omie, codigo_lancamento);

alter table public.fornecedores_regra_boleto enable row level security;
alter table public.boletos_fornecedor enable row level security;
alter table public.boleto_parcelas enable row level security;
alter table public.boleto_titulos enable row level security;
revoke all on public.fornecedores_regra_boleto from anon, authenticated;
revoke all on public.boletos_fornecedor from anon, authenticated;
revoke all on public.boleto_parcelas from anon, authenticated;
revoke all on public.boleto_titulos from anon, authenticated;

notify pgrst, 'reload schema';
