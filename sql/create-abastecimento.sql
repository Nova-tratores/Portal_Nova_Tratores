-- ============================================================
--  Módulo Abastecimento — upload mensal do CSV da operadora
--  de cartão-frota + relatórios (dashboard).
--  Correr no Supabase: SQL Editor -> colar -> Run
--  É seguro correr mais do que uma vez (idempotente).
-- ============================================================

-- 1) Lotes de upload (cada CSV enviado = 1 lote; excluir o lote
--    apaga os abastecimentos dele em cascata — "desfazer" o upload).
create table if not exists abastecimento_lotes (
  id             bigint generated always as identity primary key,
  arquivo_nome   text not null,
  enviado_por    text default '',          -- nome/email de quem subiu
  enviado_por_id text,                     -- auth user_id (auditoria)
  total_linhas   int not null default 0,   -- linhas de dados no CSV
  novos          int not null default 0,   -- inseridos de fato
  duplicados     int not null default 0,   -- ignorados (já existiam)
  erros          int not null default 0,   -- linhas inválidas
  periodo_min    timestamptz,              -- menor/maior data_transacao do lote
  periodo_max    timestamptz,
  created_at     timestamptz not null default now()
);

-- 2) Abastecimentos (1 linha do CSV = 1 registro).
--    Dedup pela chave de negócio placa+data/hora+litros (índice único
--    abaixo): reenviar o mesmo arquivo não duplica nada.
create table if not exists abastecimentos (
  id                 bigint generated always as identity primary key,
  lote_id            bigint not null references abastecimento_lotes(id) on delete cascade,
  -- veículo (placa normalizada: maiúscula, sem hífen/espaço)
  placa              text not null,
  id_placa           bigint,               -- Placas.IdPlaca (vínculo soft; null = placa fora da frota)
  filial_cnpj        text,
  filial_nome        text,
  modelo_veiculo     text,
  nome_veiculo       text,
  tipo_frota         text,                 -- Própria / Alugada
  motorista_cpf      text,
  motorista_nome     text,                 -- null quando "Veículo sem motorista associado"
  -- transação
  data_transacao     timestamptz not null, -- gravada com offset fixo -03:00
  data_postagem      timestamptz,
  autorizacao        text,
  nota_fiscal        text,
  -- posto (EC)
  posto_cnpj         text,
  posto_nome         text,
  posto_bandeira     text,
  posto_uf           text,
  posto_cidade       text,
  -- mercadoria / valores
  combustivel        text,                 -- Gasolina Comum / Etanol / Diesel / Diesel S50...
  litros             numeric(10,3) not null,
  valor_unitario     numeric(10,4),
  valor_original     numeric(12,2),        -- Valor total original
  valor_total        numeric(12,2),        -- Valor total COM desconto (o pago — usar nos relatórios)
  valor_economizado  numeric(12,2),
  -- medições digitadas pelo motorista (podem vir vazias/erradas)
  hodometro_anterior numeric(12,1),
  hodometro          numeric(12,1),
  horimetro_anterior numeric(12,1),
  horimetro          numeric(12,1),
  desvio_descricao   text,                 -- Sem Desvio / Desvio Acima / Desvio Abaixo
  created_at         timestamptz not null default now()
);

-- Dedup: numeric compara por VALOR no índice (10.0 = 10.000), então a
-- chave é determinística para o mesmo CSV.
create unique index if not exists uq_abastecimentos_dedup
  on abastecimentos (placa, data_transacao, litros);

-- Índices dos relatórios
create index if not exists idx_abastecimentos_data   on abastecimentos (data_transacao);
create index if not exists idx_abastecimentos_placa  on abastecimentos (placa, data_transacao);
create index if not exists idx_abastecimentos_filial on abastecimentos (filial_nome);
create index if not exists idx_abastecimentos_lote   on abastecimentos (lote_id);

-- 3) Acesso (mesmo modelo do resto do portal: cliente acede com a chave anon)
alter table abastecimento_lotes enable row level security;
drop policy if exists abastecimento_lotes_all on abastecimento_lotes;
create policy abastecimento_lotes_all on abastecimento_lotes
  for all using (true) with check (true);
grant all on abastecimento_lotes to anon, authenticated;

alter table abastecimentos enable row level security;
drop policy if exists abastecimentos_all on abastecimentos;
create policy abastecimentos_all on abastecimentos
  for all using (true) with check (true);
grant all on abastecimentos to anon, authenticated;

-- Pronto. Confirme com:
--   select * from abastecimento_lotes order by created_at desc limit 5;
--   select count(*) from abastecimentos;
