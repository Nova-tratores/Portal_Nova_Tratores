-- Frete (CT-e) ↔ nota de produto (27/11/2026).
-- A Omie não informa pela API a qual NF-e um CT-e recebido se refere; o portal sugere
-- (mesmo remetente, data próxima) e quem dá entrada confirma. Uma linha por par.
-- id_receb_nfe = 0 → "este frete não tem nota de produto no portal" (motivo obrigatório).
-- Sem esta tabela: a trava continua valendo com o que vier da janela, só não fica salvo.
--
-- 2ª parte: alertas da varredura noturna "frete fora do custo" (tarefa fretes-custo-varredura).

create table if not exists public.recebimento_frete_vinculos (
  conta_omie       text        not null,               -- minúscula, como no espelho
  id_receb_cte     bigint      not null,
  id_receb_nfe     bigint      not null default 0,     -- 0 = sem nota de produto
  motivo_sem_nota  text,
  vinculado_por    text,
  vinculado_por_id uuid,
  criado_em        timestamptz not null default now(),
  primary key (conta_omie, id_receb_cte, id_receb_nfe)
);
create index if not exists recebimento_frete_vinculos_nfe on public.recebimento_frete_vinculos (conta_omie, id_receb_nfe);
alter table public.recebimento_frete_vinculos enable row level security;
revoke all on public.recebimento_frete_vinculos from anon, authenticated;

create table if not exists public.frete_custo_alertas (
  id            bigserial primary key,
  conta_omie    text        not null,                  -- NOVA | CASTRO
  id_produto    bigint      not null,
  codigo        text,
  descricao     text,
  data_mov      text        not null,                  -- DD/MM/AAAA do movimento CTR
  cte_numero    text,
  id_doc        bigint,                                -- NF-e do CTR (idDoc da Omie)
  motivo        text        not null,                  -- estoque_zerado | cte_antes_da_nf
  qtd_antes     numeric,
  frete_valor   numeric,                               -- quanto o CMC total mudou no CTR
  cmc_antes     numeric,
  cmc_depois    numeric,
  status        text        not null default 'novo',   -- novo | visto | corrigido
  visto_por     text,
  visto_em      timestamptz,
  achado_em     timestamptz not null default now(),
  unique (conta_omie, id_produto, data_mov, cte_numero)
);
alter table public.frete_custo_alertas enable row level security;
revoke all on public.frete_custo_alertas from anon, authenticated;

-- Agendador: varredura toda madrugada (depois da cadeia pesada da noite), só leitura na Omie.
insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, intervalo_min, dias_semana, janela_inicio, janela_fim, hora, prioridade, usa_omie, grupo, duracao_max_min, ativo) values
  ('fretes-custo-varredura', 'fretes-custo-varredura', 'Fretes fora do custo', 'Estoque',
   'Lê o kardex das peças das notas recebidas nos últimos 90 dias e acha frete (CT-e) que a Omie não somou no custo: entrou com o estoque zerado ou antes da nota da carga. Só leitura; avisa no sino quem recebe Peças.',
   'diario', null, '{0,1,2,3,4,5,6}', null, null, '01:30', 'pesado', true, 'omie-pesado', 60, true)
on conflict (chave) do nothing;

notify pgrst, 'reload schema';

-- Rollback:
-- delete from agendamentos where chave = 'fretes-custo-varredura';
-- drop table if exists public.frete_custo_alertas;
-- drop table if exists public.recebimento_frete_vinculos;
