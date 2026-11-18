-- Devolução em garantia pela Omie (16/11/2026).
-- A partir de uma nota de entrada de garantia (CFOP x.949 da fábrica: Kuhn, Mahindra…) o
-- portal monta a REMESSA de retorno igual à que a Omie gera pelo Recebimento (mesmos itens,
-- preços e impostos; CFOP 5.949/6.949; chave da nota referenciada; sem mexer no estoque),
-- cria na Omie (IncluirRemessa) e fatura (ConferirRemessa + ConcluirRemessa).
-- Esta tabela guarda cada devolução: quanto de cada item já voltou (devolução parcial),
-- a remessa e a NF-e geradas, e a garantia ligada (quando sai pela seção Devolução).
-- Rodar no SQL Editor. Idempotente.

create table if not exists garantia_retornos (
  id             uuid primary key default gen_random_uuid(),
  conta_omie     text not null check (conta_omie in ('NOVA','CASTRO')),
  id_receb       bigint not null,               -- recebimento da nota da fábrica
  numero_nfe     text,                          -- nº da nota da fábrica
  chave_ref      text,                          -- chave da nota da fábrica (vai referenciada)
  fornecedor     text,
  n_cod_cli      bigint,                        -- fornecedor na Omie = destinatário da remessa
  garantia_id    uuid,                          -- garantia ligada (seção Devolução), sem FK
  cod_int_rem    text not null unique,          -- RG<id_receb>-<n>: idempotência na Omie
  n_cod_rem      bigint,                        -- remessa criada na Omie
  itens          jsonb not null default '[]',   -- [{seq, nCodProd, codigo, descricao, qtd, valor}]
  valor_total    numeric(14,2),
  texto          text,                          -- dados adicionais enviados
  status         text not null default 'criando'
                 check (status in ('criando','criada','faturada','falhou','cancelada')),
  nf_numero      text,
  nf_chave       text,
  erro           text,
  user_id        uuid,
  user_nome      text,
  criado_em      timestamptz not null default now(),
  faturado_em    timestamptz,
  atualizado_em  timestamptz not null default now()
);

create index if not exists garantia_retornos_receb_idx on garantia_retornos (conta_omie, id_receb);
create index if not exists garantia_retornos_garantia_idx on garantia_retornos (garantia_id) where garantia_id is not null;

alter table garantia_retornos enable row level security;
revoke all on garantia_retornos from anon, authenticated;

notify pgrst, 'reload schema';
