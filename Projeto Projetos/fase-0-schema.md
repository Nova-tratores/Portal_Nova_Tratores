# Fase 0 — Schema, tabelas, RLS e seed

**Objetivo:** criar o schema `cronograma` completo no projeto Supabase existente,
pronto para o motor de agendamento. Esta fase é só banco — nenhuma UI, nenhum motor.

**Pré-requisitos:** projeto Supabase já existente, com algum mecanismo de
multitenancy por organização. Adapte a checagem de org ao que já existe no repo
(ex.: tabela `public.membros_org(org_id, user_id)` ou função equivalente).

---

## Tarefas

1. Criar a migration `cronograma_fase0.sql` com tudo abaixo.
2. Aplicar via Supabase CLI / migration do repo.
3. Habilitar RLS em todas as tabelas e escrever as policies.
4. Inserir o seed de calendários padrão.
5. Escrever uma migration de rollback (`drop schema cronograma cascade`).

> **Antes de escrever**: confirme no repo o nome real da tabela/função de
> membership de org e ajuste a função `cronograma.tem_acesso_org` abaixo.

---

## DDL de referência

```sql
create schema if not exists cronograma;

-- ENUMS -------------------------------------------------------------
create type cronograma.tipo_projeto    as enum ('obra_interna','os_maquina');
create type cronograma.tipo_tarefa     as enum ('tarefa','marco','resumo');
create type cronograma.tipo_dependencia as enum ('FS','SS','FF','SF'); -- finish/start
create type cronograma.tipo_restricao  as enum
  ('asap','iniciar_nao_antes','iniciar_nao_depois','data_fixa');
create type cronograma.tipo_recurso    as enum ('pessoa','equipe','maquina');
create type cronograma.status_tarefa   as enum
  ('pendente','bloqueada','em_andamento','concluida','cancelada');

-- CALENDÁRIOS -------------------------------------------------------
create table cronograma.calendarios (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  nome          text not null,
  -- dias úteis da semana: 1=segunda ... 7=domingo (ISO). "Só quartas" = '{3}'
  dias_semana   smallint[] not null default '{1,2,3,4,5}',
  horas_por_dia numeric(4,2) not null default 8,
  criado_em     timestamptz not null default now()
);

create table cronograma.calendario_excecoes (
  id            uuid primary key default gen_random_uuid(),
  calendario_id uuid not null references cronograma.calendarios(id) on delete cascade,
  data          date not null,
  -- 'folga' remove um dia útil; 'extra' adiciona um dia útil fora do padrão
  tipo          text not null check (tipo in ('folga','extra')),
  descricao     text,
  unique (calendario_id, data)
);

-- RECURSOS ----------------------------------------------------------
create table cronograma.recursos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  nome          text not null,
  tipo          cronograma.tipo_recurso not null default 'pessoa',
  calendario_id uuid references cronograma.calendarios(id),
  ref_externa   uuid,            -- ex.: id de funcionário/máquina no sistema atual
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

-- PROJETOS ----------------------------------------------------------
create table cronograma.projetos (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
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

-- TAREFAS -----------------------------------------------------------
create table cronograma.tarefas (
  id                 uuid primary key default gen_random_uuid(),
  projeto_id         uuid not null references cronograma.projetos(id) on delete cascade,
  parent_id          uuid references cronograma.tarefas(id) on delete cascade,
  nome               text not null,
  tipo               cronograma.tipo_tarefa not null default 'tarefa',
  ordem              integer not null default 0,
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
create index on cronograma.tarefas (projeto_id);
create index on cronograma.tarefas (parent_id);

-- DEPENDÊNCIAS (arestas do grafo) -----------------------------------
create table cronograma.dependencias (
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
create index on cronograma.dependencias (projeto_id);
create index on cronograma.dependencias (sucessora_id);

-- ALOCAÇÕES ---------------------------------------------------------
create table cronograma.alocacoes (
  id          uuid primary key default gen_random_uuid(),
  tarefa_id   uuid not null references cronograma.tarefas(id) on delete cascade,
  recurso_id  uuid not null references cronograma.recursos(id) on delete cascade,
  percentual  numeric(5,2) not null default 100 check (percentual > 0 and percentual <= 100),
  unique (tarefa_id, recurso_id)
);

-- BASELINES ---------------------------------------------------------
create table cronograma.baselines (
  id          uuid primary key default gen_random_uuid(),
  projeto_id  uuid not null references cronograma.projetos(id) on delete cascade,
  nome        text not null,
  criado_em   timestamptz not null default now()
);
create table cronograma.baseline_tarefas (
  baseline_id uuid not null references cronograma.baselines(id) on delete cascade,
  tarefa_id   uuid not null references cronograma.tarefas(id) on delete cascade,
  inicio      date,
  fim         date,
  primary key (baseline_id, tarefa_id)
);
```

## RLS

```sql
-- Ajuste esta função à sua tabela/função de membership real.
create or replace function cronograma.tem_acesso_org(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.membros_org m
    where m.org_id = p_org and m.user_id = auth.uid()
  );
$$;

-- Habilitar RLS em todas as tabelas
alter table cronograma.calendarios          enable row level security;
alter table cronograma.calendario_excecoes  enable row level security;
alter table cronograma.recursos             enable row level security;
alter table cronograma.projetos             enable row level security;
alter table cronograma.tarefas              enable row level security;
alter table cronograma.dependencias         enable row level security;
alter table cronograma.alocacoes            enable row level security;
alter table cronograma.baselines            enable row level security;
alter table cronograma.baseline_tarefas     enable row level security;

-- Policies por org (exemplo para projetos; replicar o padrão).
-- Tabelas filhas checam a org via join com a tabela-mãe.
create policy proj_rw on cronograma.projetos
  using (cronograma.tem_acesso_org(org_id))
  with check (cronograma.tem_acesso_org(org_id));

create policy tarefas_rw on cronograma.tarefas
  using (exists (select 1 from cronograma.projetos p
                 where p.id = projeto_id and cronograma.tem_acesso_org(p.org_id)))
  with check (exists (select 1 from cronograma.projetos p
                 where p.id = projeto_id and cronograma.tem_acesso_org(p.org_id)));
```

> Replicar a policy de `tarefas` para `dependencias`, `alocacoes`, `baselines`,
> `baseline_tarefas` (via join até `projetos`), e a de `projetos` para
> `calendarios`/`recursos` (que têm `org_id` direto). `calendario_excecoes`
> checa via join em `calendarios`.

## Seed

```sql
-- Calendário padrão seg–sex e um calendário "só quartas" de exemplo.
insert into cronograma.calendarios (org_id, nome, dias_semana) values
  ('<ORG_ID>', 'Comercial (seg–sex)', '{1,2,3,4,5}'),
  ('<ORG_ID>', 'Pintor (só quartas)', '{3}');
```

---

## Gate de revisão — Fase 0

- [ ] Migration aplica e faz rollback limpo.
- [ ] RLS ativa em todas as tabelas; usuário sem acesso à org não enxerga nada.
- [ ] A função de membership aponta para a tabela/função real do repo.
- [ ] Campos `*_calc`, `folga_dias`, `e_critica` existem e estão NULL/false (serão
      preenchidos só pelo motor).
- [ ] Seed criou os calendários, incluindo o "só quartas".

**Pare aqui e peça revisão antes da Fase 1.**
