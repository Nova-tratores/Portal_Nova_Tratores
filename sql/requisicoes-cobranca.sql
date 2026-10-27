-- Robô de cobrança de requisições (José, 26/10/2026).
-- PROJETO: Supabase do PORTAL (citrhumdkfivdzbmayde) — SQL Editor. Idempotente.
--
-- O que faz:
--  1. "Requisicao" ganha cobranca_status ('a_cobrar' | 'cobrada' | 'nao_cobrada'), cobranca_motivo,
--     cobranca_por, cobranca_em. Vazio = ainda não olhado.
--  2. lembretes_clientes ganha id_ordem, requisicao_id, tipo ('manual' | 'cobranca_requisicao'), lembrar_em,
--     responsavel, origem ('usuario' | 'robo'), concluido_em_ordem (a tela já mandava e dava 500) e
--     conclusao_nota; índice único impede o robô de abrir 2 lembretes abertos para a mesma requisição.
--  3. Carga: requisições ANTIGAS (antes de 26/10/2026 00:00 de Brasília) que deveriam ter sido cobradas e estão
--     sem valor cobrado viram "não cobrada" com motivo "Anterior ao controle de cobrança (26/10/2026)".
--     Regra (igual a src/lib/pos/cobranca-requisicoes.ts → deveSerCobrada): status fora de lixeira/cancelar/
--     cancelada, tipo ≠ Alimentação, valor_cobrado_cliente vazio, e (tem OS OU tipo Peças/Serviço de Terceiros).
--     Na conferência de 26/10 eram 198 requisições.
--  4. Agendamento 'pos-requisicoes-cobranca' (a cada 30 min) na tela /agendamentos.

-- ─── 1. Requisicao ─────────────────────────────────────────────────────────────
alter table "Requisicao" add column if not exists cobranca_status text
  check (cobranca_status is null or cobranca_status in ('a_cobrar', 'cobrada', 'nao_cobrada'));
alter table "Requisicao" add column if not exists cobranca_motivo text;
alter table "Requisicao" add column if not exists cobranca_por    text;
alter table "Requisicao" add column if not exists cobranca_em     timestamptz;

create index if not exists idx_requisicao_cobranca_aberta
  on "Requisicao" (created_at) where cobranca_status is null or cobranca_status = 'a_cobrar';

-- ─── 2. lembretes_clientes ─────────────────────────────────────────────────────
alter table lembretes_clientes add column if not exists id_ordem           text;
alter table lembretes_clientes add column if not exists requisicao_id      bigint;
alter table lembretes_clientes add column if not exists tipo               text not null default 'manual'
  check (tipo in ('manual', 'cobranca_requisicao'));
alter table lembretes_clientes add column if not exists lembrar_em         date;
alter table lembretes_clientes add column if not exists responsavel        text;
alter table lembretes_clientes add column if not exists origem             text not null default 'usuario'
  check (origem in ('usuario', 'robo'));
alter table lembretes_clientes add column if not exists concluido_em_ordem text;
alter table lembretes_clientes add column if not exists conclusao_nota     text;
-- valor a cobrar / crédito do cliente: oferecido ao abrir a próxima OS (José, 27/10/2026)
alter table lembretes_clientes add column if not exists valor              numeric(12,2);
alter table lembretes_clientes add column if not exists valor_tipo         text
  check (valor_tipo is null or valor_tipo in ('cobrar', 'credito'));

create index if not exists idx_lembretes_id_ordem on lembretes_clientes (id_ordem) where id_ordem is not null;
create index if not exists idx_lembretes_requisicao on lembretes_clientes (requisicao_id) where requisicao_id is not null;
-- 1 lembrete de cobrança ABERTO por requisição (o robô não duplica)
create unique index if not exists uq_lembretes_cobranca_aberta
  on lembretes_clientes (requisicao_id) where tipo = 'cobranca_requisicao' and concluido is not true;

-- ─── 3. Carga das antigas (antes de 26/10/2026 BRT) ────────────────────────────
update "Requisicao" set
  cobranca_status = 'nao_cobrada',
  cobranca_motivo = 'Anterior ao controle de cobrança (26/10/2026)',
  cobranca_por    = 'Robô de cobrança',
  cobranca_em     = now()
where created_at < '2026-10-26 03:00+00'
  and cobranca_status is null
  and lower(coalesce(status, '')) not in ('lixeira', 'cancelar', 'cancelada')
  and coalesce(tipo, '') not ilike '%alimenta%'
  and nullif(trim(coalesce(valor_cobrado_cliente::text, '')), '') is null
  and coalesce(ordem_servico, '') !~* '-T[123]$'
  and (nullif(trim(coalesce(ordem_servico, '')), '') is not null or tipo in ('Peças', 'Serviço de Terceiros'));

-- ─── 4. Agendamento (tela /agendamentos) ───────────────────────────────────────
-- Sem a tabela `agendamentos` o instrumentation.ts roda o robô igual (fallback).
do $$
begin
  if to_regclass('public.agendamentos') is not null then
    insert into public.agendamentos (chave, handler, nome, modulo, descricao, tipo, intervalo_min, prioridade, usa_omie, duracao_max_min, ativo)
    values ('pos-requisicoes-cobranca', 'pos-requisicoes-cobranca', 'Cobrança de requisições', 'POS',
            'Requisição que deveria ser cobrada do cliente e está sem valor cobrado vira lembrete no POS e aviso no sino do Pós-Vendas; fecha sozinho quando cobrada ou cancelada.',
            'intervalo', 30, 'rapido', false, 5, true)
    on conflict (chave) do nothing;
  end if;
end $$;

notify pgrst, 'reload schema';

-- Conferência:
-- select cobranca_status, count(*) from "Requisicao" group by 1;
-- select id, id_ordem, requisicao_id, lembrete, concluido from lembretes_clientes where tipo = 'cobranca_requisicao' order by id desc;
--
-- Rollback (só se precisar):
-- delete from agendamentos where chave = 'pos-requisicoes-cobranca';
-- update "Requisicao" set cobranca_status = null, cobranca_motivo = null, cobranca_por = null, cobranca_em = null
--   where cobranca_motivo = 'Anterior ao controle de cobrança (26/10/2026)';
