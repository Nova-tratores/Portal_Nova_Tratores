-- =============================================================================
-- REUNIÕES (pauta + ata) sobre a engine de Tickets — Central de Trabalho
--
-- Reunião É um ticket (tipo='reuniao', etapa própria em reuniao_etapa; o status
-- genérico é só projeção, como a Solicitação de Compras). Cada ação decidida
-- é um ticket comum (tipo='generico') com origem_reuniao_id apontando para o
-- ticket da reunião — ganha de graça aceite, blocos, cronograma, "Seu dia",
-- notificações e visão gerencial. A lista de ações é a fonte da verdade.
--
-- Conferido na Fase 0 (09/10/2026):
--   * tickets.id é UUID (numero é o bigint legível) → todas as FKs em uuid;
--   * tickets.tipo NÃO tem CHECK (valores em uso: generico, compras, war_room);
--     não criamos CHECK aqui de propósito;
--   * tickets.prazo é DATE → a hora da reunião vai em reuniao_inicio (timestamptz)
--     e prazo recebe o DIA (o cronograma geral já mostra pelo dia);
--   * tickets_eventos.tipo tem CHECK recriado por sql/tickets-vinculos.sql —
--     recriado de novo aqui com a lista inteira + 6 tipos novos;
--   * tickets_pode_ver(uuid) já existe (security definer) e cobre itens/presenças/ata;
--   * portal_permissoes.modulos_permitidos é TEXT[] (lido via to_jsonb, como em
--     sql/agro-score-v2-gate1.sql, para não depender do tipo).
--
-- Rodar no SQL Editor do Supabase. Idempotente. Rollback comentado no fim.
-- Antes de rodar, conferir a lista real do CHECK de eventos em produção:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'tickets_eventos'::regclass AND conname = 'tickets_eventos_tipo_check';
-- Se houver algum tipo fora da lista da seção 5, incluí-lo lá antes de rodar.
-- =============================================================================

-- ---------------------------------------------------------------------
-- 1) SÉRIES — "Semanal Oficina", "Comercial segunda"…
-- ---------------------------------------------------------------------
create table if not exists public.reunioes_series (
  id                        uuid primary key default gen_random_uuid(),
  nome                      text not null check (char_length(nome) between 1 and 120),
  condutor_id               uuid not null references auth.users(id),
  -- Rodízio de secretário: a instância N usa secretarios_rodizio[(N mod len)+1].
  secretarios_rodizio       uuid[] not null default '{}',
  participantes_padrao      uuid[] not null default '{}',
  recorrencia               text not null default 'nenhuma'
                            check (recorrencia in ('nenhuma', 'semanal', 'quinzenal', 'mensal')),
  dia_semana                smallint check (dia_semana between 0 and 6),   -- 0 = domingo
  hora                      time,
  duracao_min               int not null default 30 check (duracao_min between 5 and 480),
  corte_antecedencia_horas  int not null default 18 check (corte_antecedencia_horas between 0 and 168),
  visibilidade              text not null default 'publico' check (visibilidade in ('privado', 'publico')),
  ativa                     boolean not null default true,
  -- Contador de instâncias geradas (base do rodízio de secretário).
  instancias_geradas        int not null default 0,
  criado_por                uuid references auth.users(id),
  criado_em                 timestamptz not null default now(),
  atualizado_em             timestamptz not null default now()
);
create index if not exists reunioes_series_ativa_idx on public.reunioes_series (ativa) where ativa;

-- ---------------------------------------------------------------------
-- 2) TICKETS — colunas da reunião e da ação nascida em reunião
-- ---------------------------------------------------------------------
alter table public.tickets add column if not exists reuniao_etapa text
  check (reuniao_etapa in ('agendada', 'pauta_fechada', 'em_andamento', 'ata_rascunho', 'ata_publicada', 'cancelada'));
alter table public.tickets add column if not exists reuniao_serie_id uuid
  references public.reunioes_series(id) on delete set null;
-- Data/hora de início da reunião (prazo = o dia, para o cronograma geral).
alter table public.tickets add column if not exists reuniao_inicio timestamptz;
-- Ação nascida numa reunião: aponta para o ticket da reunião (e para o item).
alter table public.tickets add column if not exists origem_reuniao_id uuid
  references public.tickets(id) on delete set null;
-- FK de origem_reuniao_item_id é adicionada na seção 3 (a tabela ainda não existe aqui).
alter table public.tickets add column if not exists origem_reuniao_item_id uuid;
-- Quantas vezes o prazo foi reprogramado (R4: >= 2 bloqueia "novo prazo").
alter table public.tickets add column if not exists prazo_reprogramacoes int not null default 0
  check (prazo_reprogramacoes >= 0);

-- reuniao_etapa preenchida  <=>  tipo = 'reuniao'  (vale para as linhas atuais: todas NULL/≠reuniao)
alter table public.tickets drop constraint if exists tickets_reuniao_etapa_coerente;
alter table public.tickets add constraint tickets_reuniao_etapa_coerente
  check ((tipo = 'reuniao') = (reuniao_etapa is not null));
-- reunião precisa ter data/hora
alter table public.tickets drop constraint if exists tickets_reuniao_inicio_coerente;
alter table public.tickets add constraint tickets_reuniao_inicio_coerente
  check (tipo <> 'reuniao' or reuniao_inicio is not null);

create index if not exists tickets_origem_reuniao_idx on public.tickets (origem_reuniao_id)
  where origem_reuniao_id is not null;
create index if not exists tickets_reuniao_serie_inicio_idx on public.tickets (reuniao_serie_id, reuniao_inicio)
  where tipo = 'reuniao';
create index if not exists tickets_reuniao_etapa_idx on public.tickets (reuniao_etapa)
  where tipo = 'reuniao';

-- ---------------------------------------------------------------------
-- 3) ITENS DA PAUTA — cada item é uma pergunta
-- ---------------------------------------------------------------------
create table if not exists public.reunioes_itens (
  id                    uuid primary key default gen_random_uuid(),
  reuniao_id            uuid not null references public.tickets(id) on delete cascade,
  ordem                 int not null default 0,
  pergunta              text not null check (char_length(pergunta) between 1 and 500),
  tipo                  text not null check (tipo in ('decidir', 'informar', 'discutir')),
  trazido_por           uuid not null references auth.users(id),
  tempo_min             int not null default 5 check (tempo_min between 1 and 240),
  origem                text not null default 'manual'
                        check (origem in ('manual', 'pendencia_escalada', 'parking_anterior', 'adiado_anterior', 'parking')),
  -- Para pendencia_escalada: a ação que estourou o limite de reprogramações.
  ticket_referencia_id  uuid references public.tickets(id) on delete set null,
  -- Para parking_anterior/adiado_anterior: o item da reunião anterior que o gerou.
  item_origem_id        uuid references public.reunioes_itens(id) on delete set null,
  urgente               boolean not null default false,   -- entrou depois do corte (só condutor)
  resultado             text check (resultado in ('decidido', 'adiado', 'parking', 'informado', 'discutido')),
  decisao_texto         text check (char_length(decisao_texto) <= 2000),
  decisao_motivo        text check (char_length(decisao_motivo) <= 2000),
  notas                 text check (char_length(notas) <= 4000),
  criado_por            uuid references auth.users(id),
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  -- R7: "decidido" só com texto E motivo (NULLIF barra string vazia).
  constraint reunioes_itens_decidido_completo check (
    resultado is distinct from 'decidido'
    or (nullif(btrim(decisao_texto), '') is not null and nullif(btrim(decisao_motivo), '') is not null)
  )
);
create index if not exists reunioes_itens_reuniao_idx on public.reunioes_itens (reuniao_id, ordem);
create index if not exists reunioes_itens_ref_idx on public.reunioes_itens (ticket_referencia_id)
  where ticket_referencia_id is not null;

-- Agora a FK da ação para o item que a gerou.
alter table public.tickets drop constraint if exists tickets_origem_reuniao_item_fk;
alter table public.tickets add constraint tickets_origem_reuniao_item_fk
  foreign key (origem_reuniao_item_id) references public.reunioes_itens(id) on delete set null;

-- ---------------------------------------------------------------------
-- 4) PRESENÇAS / PAPÉIS e ATA
-- ---------------------------------------------------------------------
create table if not exists public.reunioes_presencas (
  reuniao_id  uuid not null references public.tickets(id) on delete cascade,
  usuario_id  uuid not null references auth.users(id),
  papel       text not null default 'participante' check (papel in ('condutor', 'secretario', 'participante')),
  presente    boolean,                      -- null = não marcado
  marcado_em  timestamptz,
  primary key (reuniao_id, usuario_id)
);
create index if not exists reunioes_presencas_usuario_idx on public.reunioes_presencas (usuario_id);

-- Ata publicada = snapshot imutável. Sem UPDATE/DELETE pela API; correção = evento ata_adendo.
create table if not exists public.reunioes_ata (
  reuniao_id      uuid primary key references public.tickets(id) on delete cascade,
  publicada_em    timestamptz not null default now(),
  publicada_por   uuid not null references auth.users(id),
  snapshot        jsonb not null,           -- pauta + resultados + ações + presenças + pendências tratadas
  texto_whatsapp  text not null
);

-- ---------------------------------------------------------------------
-- 5) EVENTOS NOVOS na timeline (DROP + ADD no mesmo bloco, lista completa:
--    tudo que existe em produção + os 6 de reunião). Pauta incluída/removida/
--    reordenada e presença NÃO ganham tipo: vão como 'edicao' com payload.campo.
-- ---------------------------------------------------------------------
alter table public.tickets_eventos drop constraint if exists tickets_eventos_tipo_check;
alter table public.tickets_eventos add constraint tickets_eventos_tipo_check
  check (tipo in (
    -- v1 (genérico)
    'criacao', 'comentario', 'status', 'transferencia',
    'participante_adicionado', 'participante_removido',
    'pedido_atualizacao', 'edicao', 'anexo',
    -- v2 (SC / compras)
    'sc_criada', 'qtd_alterada', 'parecer_financeiro', 'pc_emitido',
    -- War Room
    'wr_acao_criada', 'wr_decisao_vinculada',
    -- Tickets ↔ Requisições
    'vinculo_adicionado', 'vinculo_removido',
    -- Reuniões
    'reuniao_etapa',       -- {de, para}
    'item_resultado',      -- {item_id, pergunta, resultado, decisao_texto?, decisao_motivo?}
    'acao_criada',         -- no ticket da REUNIÃO: {ticket_id, numero, titulo, responsavel_id, prazo, item_id?}
    'pendencia_tratada',   -- na AÇÃO e na REUNIÃO: {saida: novo_prazo|reatribuir|escalar|cancelar, reuniao_id, ticket_id, de?, para?}
    'ata_publicada',       -- {decididos, acoes, atrasadas}
    'ata_adendo'           -- {texto}
  ));

-- ---------------------------------------------------------------------
-- 6) RLS — leitura pela visibilidade do ticket da reunião; escrita só service role
-- ---------------------------------------------------------------------
-- Quem vê a série: admin/dev, condutor, participante padrão, ou série pública
-- para quem tem a Central (tickets | tarefas | cronograma, com ou sem ':ação').
create or replace function public.reunioes_serie_pode_ver(p_serie uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from reunioes_series s
    where s.id = p_serie
      and (
        s.condutor_id = auth.uid()
        or auth.uid() = any (s.participantes_padrao)
        or auth.uid() = any (s.secretarios_rodizio)
        or exists (select 1 from portal_permissoes pp
                   where pp.user_id = auth.uid() and (pp.is_admin is true or pp.is_dev is true))
        or (s.visibilidade = 'publico' and exists (
              select 1 from portal_permissoes pp,
                   jsonb_array_elements_text(coalesce(to_jsonb(pp.modulos_permitidos), '[]'::jsonb)) m
              where pp.user_id = auth.uid()
                and (m in ('tickets', 'tarefas', 'cronograma')
                     or m like 'tickets:%' or m like 'tarefas:%' or m like 'cronograma:%')))
      )
  );
$$;
revoke all on function public.reunioes_serie_pode_ver(uuid) from public;
grant execute on function public.reunioes_serie_pode_ver(uuid) to authenticated;

alter table public.reunioes_series    enable row level security;
alter table public.reunioes_itens     enable row level security;
alter table public.reunioes_presencas enable row level security;
alter table public.reunioes_ata       enable row level security;

drop policy if exists reunioes_series_select on public.reunioes_series;
create policy reunioes_series_select on public.reunioes_series
  for select to authenticated using (reunioes_serie_pode_ver(id));

drop policy if exists reunioes_itens_select on public.reunioes_itens;
create policy reunioes_itens_select on public.reunioes_itens
  for select to authenticated using (tickets_pode_ver(reuniao_id));

drop policy if exists reunioes_presencas_select on public.reunioes_presencas;
create policy reunioes_presencas_select on public.reunioes_presencas
  for select to authenticated using (tickets_pode_ver(reuniao_id));

drop policy if exists reunioes_ata_select on public.reunioes_ata;
create policy reunioes_ata_select on public.reunioes_ata
  for select to authenticated using (tickets_pode_ver(reuniao_id));

-- Sem policies de INSERT/UPDATE/DELETE: mutações só pelo service role (rotas /api/reunioes/*).
revoke insert, update, delete on public.reunioes_series    from anon, authenticated;
revoke insert, update, delete on public.reunioes_itens     from anon, authenticated;
revoke insert, update, delete on public.reunioes_presencas from anon, authenticated;
revoke insert, update, delete on public.reunioes_ata       from anon, authenticated;

-- ---------------------------------------------------------------------
-- 7) Conferência
-- ---------------------------------------------------------------------
--   SELECT column_name FROM information_schema.columns WHERE table_name='tickets'
--     AND column_name IN ('reuniao_etapa','reuniao_serie_id','reuniao_inicio','origem_reuniao_id','origem_reuniao_item_id','prazo_reprogramacoes');
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'tickets_eventos_tipo_check';  -- deve conter 'ata_adendo'
--   SELECT policyname, cmd FROM pg_policies WHERE tablename LIKE 'reunioes_%';

notify pgrst, 'reload schema';

-- =============================================================================
-- ROLLBACK (manual — rodar só se for desfazer tudo; ordem importa)
-- =============================================================================
-- drop policy if exists reunioes_ata_select       on public.reunioes_ata;
-- drop policy if exists reunioes_presencas_select on public.reunioes_presencas;
-- drop policy if exists reunioes_itens_select     on public.reunioes_itens;
-- drop policy if exists reunioes_series_select    on public.reunioes_series;
-- drop function if exists public.reunioes_serie_pode_ver(uuid);
-- alter table public.tickets drop constraint if exists tickets_origem_reuniao_item_fk;
-- alter table public.tickets drop constraint if exists tickets_reuniao_inicio_coerente;
-- alter table public.tickets drop constraint if exists tickets_reuniao_etapa_coerente;
-- drop index if exists tickets_origem_reuniao_idx;
-- drop index if exists tickets_reuniao_serie_inicio_idx;
-- drop index if exists tickets_reuniao_etapa_idx;
-- drop table if exists public.reunioes_ata;
-- drop table if exists public.reunioes_presencas;
-- drop table if exists public.reunioes_itens;
-- -- ⚠️ Antes de dropar as colunas, apagar (ou converter) os tickets tipo='reuniao':
-- --   delete from public.tickets where tipo = 'reuniao';
-- alter table public.tickets drop column if exists prazo_reprogramacoes;
-- alter table public.tickets drop column if exists origem_reuniao_item_id;
-- alter table public.tickets drop column if exists origem_reuniao_id;
-- alter table public.tickets drop column if exists reuniao_inicio;
-- alter table public.tickets drop column if exists reuniao_serie_id;
-- alter table public.tickets drop column if exists reuniao_etapa;
-- drop table if exists public.reunioes_series;
-- -- CHECK de eventos: voltar à lista de sql/tickets-vinculos.sql (sem os 6 tipos de reunião).
-- -- Só é seguro depois de: delete from tickets_eventos where tipo in
-- --   ('reuniao_etapa','item_resultado','acao_criada','pendencia_tratada','ata_publicada','ata_adendo');
-- alter table public.tickets_eventos drop constraint if exists tickets_eventos_tipo_check;
-- alter table public.tickets_eventos add constraint tickets_eventos_tipo_check check (tipo in (
--   'criacao','comentario','status','transferencia','participante_adicionado','participante_removido',
--   'pedido_atualizacao','edicao','anexo','sc_criada','qtd_alterada','parecer_financeiro','pc_emitido',
--   'wr_acao_criada','wr_decisao_vinculada','vinculo_adicionado','vinculo_removido'));
-- notify pgrst, 'reload schema';
