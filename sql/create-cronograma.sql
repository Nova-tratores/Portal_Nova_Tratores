-- ════════════════════════════════════════════════════════════════════
-- Cronograma — Gantt + Caminho Crítico (Fase 0: schema, RLS, seed)
-- Módulo de gestão de projetos: tarefas, dependências, calendários de
-- recurso, caminho crítico (CPM) e replanejamento automático.
-- Um projeto = obra interna OU OS de máquina (cronograma.projetos.tipo).
--
-- Schema dedicado `cronograma`. Acesso GLOBAL (qualquer usuário autenticado);
-- o gate por usuário é feito na UI via portal_permissoes ('cronograma').
--
-- IMPORTANTE (passo manual, fora deste SQL): para o PostgREST/Data API
-- enxergar o schema, adicione `cronograma` em
--   Supabase ▸ Settings ▸ API ▸ Exposed schemas
-- (ou env PGRST_DB_SCHEMAS=public,storage,cronograma). Sem isso o front
-- não consegue chamar supabase.schema('cronograma')...
--
-- Aplicação manual (como as demais migrations do repo). Rollback em
-- sql/drop-cronograma.sql.
-- ════════════════════════════════════════════════════════════════════

create schema if not exists cronograma;

-- ENUMS ───────────────────────────────────────────────────────────────
do $$ begin
  create type cronograma.tipo_projeto     as enum ('obra_interna','os_maquina');
exception when duplicate_object then null; end $$;
do $$ begin
  create type cronograma.tipo_tarefa      as enum ('tarefa','marco','resumo');
exception when duplicate_object then null; end $$;
do $$ begin
  create type cronograma.tipo_dependencia as enum ('FS','SS','FF','SF'); -- finish/start
exception when duplicate_object then null; end $$;
do $$ begin
  create type cronograma.tipo_restricao   as enum
    ('asap','iniciar_nao_antes','iniciar_nao_depois','data_fixa');
exception when duplicate_object then null; end $$;
do $$ begin
  create type cronograma.tipo_recurso     as enum ('pessoa','equipe','maquina');
exception when duplicate_object then null; end $$;
do $$ begin
  create type cronograma.status_tarefa    as enum
    ('pendente','bloqueada','em_andamento','concluida','cancelada');
exception when duplicate_object then null; end $$;

-- CALENDÁRIOS ─────────────────────────────────────────────────────────
create table if not exists cronograma.calendarios (
  id            uuid primary key default gen_random_uuid(),
  conta_omie    text,                         -- rótulo de origem (nova/castro); não usado em RLS
  nome          text not null,
  -- dias úteis da semana: 1=segunda ... 7=domingo (ISO). "Só quartas" = '{3}'
  dias_semana   smallint[] not null default '{1,2,3,4,5}',
  horas_por_dia numeric(4,2) not null default 8,
  criado_em     timestamptz not null default now()
);

create table if not exists cronograma.calendario_excecoes (
  id            uuid primary key default gen_random_uuid(),
  calendario_id uuid not null references cronograma.calendarios(id) on delete cascade,
  data          date not null,
  -- 'folga' remove um dia útil; 'extra' adiciona um dia útil fora do padrão
  tipo          text not null check (tipo in ('folga','extra')),
  descricao     text,
  unique (calendario_id, data)
);

-- RECURSOS ────────────────────────────────────────────────────────────
create table if not exists cronograma.recursos (
  id            uuid primary key default gen_random_uuid(),
  conta_omie    text,
  nome          text not null,
  tipo          cronograma.tipo_recurso not null default 'pessoa',
  calendario_id uuid references cronograma.calendarios(id),
  -- pessoas reaproveitam o cadastro existente: ref_externa = financeiro_usu.id
  -- (mesma fonte do módulo /tarefas; reusar nome/avatar de lá no front)
  ref_externa   uuid,            -- pessoa→financeiro_usu.id; máquina→trator/OS
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

-- PROJETOS ────────────────────────────────────────────────────────────
create table if not exists cronograma.projetos (
  id              uuid primary key default gen_random_uuid(),
  conta_omie      text,
  nome            text not null,
  tipo            cronograma.tipo_projeto not null,
  os_ref          uuid,          -- liga a uma OS/máquina externa quando tipo='os_maquina'
  data_inicio     date not null default current_date,
  calendario_id   uuid references cronograma.calendarios(id), -- calendário padrão do projeto
  status          text not null default 'ativo'
                  check (status in ('ativo','pausado','concluido','cancelado')),
  data_fim_calc   date,          -- preenchida pelo motor (fim do projeto)
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

-- TAREFAS ─────────────────────────────────────────────────────────────
create table if not exists cronograma.tarefas (
  id                 uuid primary key default gen_random_uuid(),
  projeto_id         uuid not null references cronograma.projetos(id) on delete cascade,
  parent_id          uuid references cronograma.tarefas(id) on delete cascade,
  nome               text not null,
  descricao          text,                    -- paridade com o módulo /tarefas
  tipo               cronograma.tipo_tarefa not null default 'tarefa',
  ordem              integer not null default 0,
  -- 0=sem ... 5=crítica (mesma escala do PRIORITY_MAP de portal_tarefas)
  prioridade         smallint not null default 0 check (prioridade between 0 and 5),
  duracao_dias       numeric(6,2) not null default 1 check (duracao_dias >= 0),
  restricao          cronograma.tipo_restricao not null default 'asap',
  restricao_data     date,        -- usada quando restricao <> 'asap'
  status             cronograma.status_tarefa not null default 'pendente',
  progresso          numeric(5,2) not null default 0 check (progresso between 0 and 100),
  recurso_id         uuid references cronograma.recursos(id),
  -- datas informadas pelo usuário (planejamento manual / reais)
  inicio_planejado   date,
  fim_planejado      date,
  inicio_real        date,
  fim_real           date,
  -- saída do motor (NUNCA editadas à mão; sempre sobrescritas pelo recálculo)
  inicio_calc        date,
  fim_calc           date,
  folga_dias         numeric(6,2),
  e_critica          boolean not null default false,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  check (restricao = 'asap' or restricao_data is not null)
);
create index if not exists idx_cron_tarefas_projeto on cronograma.tarefas (projeto_id);
create index if not exists idx_cron_tarefas_parent  on cronograma.tarefas (parent_id);

-- DEPENDÊNCIAS (arestas do grafo) ─────────────────────────────────────
create table if not exists cronograma.dependencias (
  id              uuid primary key default gen_random_uuid(),
  projeto_id      uuid not null references cronograma.projetos(id) on delete cascade,
  predecessora_id uuid not null references cronograma.tarefas(id) on delete cascade,
  sucessora_id    uuid not null references cronograma.tarefas(id) on delete cascade,
  tipo            cronograma.tipo_dependencia not null default 'FS',
  lag_dias        numeric(6,2) not null default 0,   -- defasagem (pode ser negativa)
  criado_em       timestamptz not null default now(),
  unique (predecessora_id, sucessora_id),
  check (predecessora_id <> sucessora_id)
);
create index if not exists idx_cron_deps_projeto   on cronograma.dependencias (projeto_id);
create index if not exists idx_cron_deps_sucessora on cronograma.dependencias (sucessora_id);

-- ALOCAÇÕES ───────────────────────────────────────────────────────────
create table if not exists cronograma.alocacoes (
  id          uuid primary key default gen_random_uuid(),
  tarefa_id   uuid not null references cronograma.tarefas(id) on delete cascade,
  recurso_id  uuid not null references cronograma.recursos(id) on delete cascade,
  percentual  numeric(5,2) not null default 100 check (percentual > 0 and percentual <= 100),
  unique (tarefa_id, recurso_id)
);

-- BASELINES ───────────────────────────────────────────────────────────
create table if not exists cronograma.baselines (
  id          uuid primary key default gen_random_uuid(),
  projeto_id  uuid not null references cronograma.projetos(id) on delete cascade,
  nome        text not null,
  criado_em   timestamptz not null default now()
);
create table if not exists cronograma.baseline_tarefas (
  baseline_id uuid not null references cronograma.baselines(id) on delete cascade,
  tarefa_id   uuid not null references cronograma.tarefas(id) on delete cascade,
  inicio      date,
  fim         date,
  primary key (baseline_id, tarefa_id)
);

-- RLS ─────────────────────────────────────────────────────────────────
-- Acesso global: qualquer usuário autenticado lê/escreve. O isolamento por
-- usuário é feito na UI (portal_permissoes 'cronograma'); não há org_id.
do $$
declare t text;
begin
  foreach t in array array[
    'calendarios','calendario_excecoes','recursos','projetos',
    'tarefas','dependencias','alocacoes','baselines','baseline_tarefas'
  ] loop
    execute format('alter table cronograma.%I enable row level security;', t);
    execute format('drop policy if exists %I on cronograma.%I;', t||'_auth_all', t);
    execute format(
      'create policy %I on cronograma.%I for all '
      || 'using (auth.role() = ''authenticated'') '
      || 'with check (auth.role() = ''authenticated'');',
      t||'_auth_all', t);
  end loop;
end $$;

-- GRANTS (pré-requisito do Data API para schema não-public) ────────────
grant usage on schema cronograma to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema cronograma
  to anon, authenticated, service_role;
grant usage, select on all sequences in schema cronograma
  to anon, authenticated, service_role;
grant execute on all functions in schema cronograma
  to anon, authenticated, service_role;
-- defaults para objetos criados depois (ex.: RPCs da Fase 2)
alter default privileges in schema cronograma
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema cronograma
  grant execute on functions to anon, authenticated, service_role;

-- REALTIME ────────────────────────────────────────────────────────────
-- Cliente reconcilia o preview quando o recálculo termina. (idempotente)
do $$ begin
  alter publication supabase_realtime add table cronograma.tarefas;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table cronograma.dependencias;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table cronograma.projetos;
exception when duplicate_object then null; end $$;

-- SEED ────────────────────────────────────────────────────────────────
-- Calendário padrão seg–sex e o "só quartas" (caso do pintor).
insert into cronograma.calendarios (nome, dias_semana)
select 'Comercial (seg–sex)', '{1,2,3,4,5}'::smallint[]
where not exists (select 1 from cronograma.calendarios where nome = 'Comercial (seg–sex)');

insert into cronograma.calendarios (nome, dias_semana)
select 'Pintor (só quartas)', '{3}'::smallint[]
where not exists (select 1 from cronograma.calendarios where nome = 'Pintor (só quartas)');
