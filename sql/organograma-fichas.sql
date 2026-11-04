-- Organograma — ficha de cada função (o que se espera do papel): missão, responde a, responsabilidades
-- (que agrupam as tarefas de org_tarefas), autoridade, requisitos e indicadores. Fica na mesma
-- org_funcoes (sql/organograma-tarefas.sql), que já guarda quem ocupa cada função.
-- 1ª etapa (29/10/2026): funções do Pós-vendas e do Mariano. A IA rascunha a partir das tarefas; um
-- admin revisa e aprova (nada fica "aprovada" sem humano). Editar uma ficha aprovada volta para rascunho.
-- Escrita só pela rota /api/organograma/funcoes (service role). Idempotente.
-- Precisa de sql/organograma-tarefas.sql antes.

alter table public.org_funcoes
  add column if not exists titulo            text check (titulo is null or char_length(titulo) <= 80),
  add column if not exists tipo              text not null default 'funcao' check (tipo in ('funcao', 'grupo')),
  add column if not exists setor             text check (setor is null or char_length(setor) <= 60),
  add column if not exists missao            text check (missao is null or char_length(missao) <= 600),
  add column if not exists responde_a        text,                                  -- outra função (chave)
  add column if not exists responsabilidades jsonb not null default '[]'::jsonb,    -- [{titulo, descricao, tarefas:[id]}]
  add column if not exists autoridade        text[] not null default '{}',          -- decide sozinho / precisa aprovar
  add column if not exists requisitos        text[] not null default '{}',
  add column if not exists indicadores       jsonb not null default '[]'::jsonb,    -- [{texto, kpi?}] (kpi = id da Planta Viva)
  add column if not exists cargo_rh          text check (cargo_rh is null or char_length(cargo_rh) <= 80),
  add column if not exists status            text not null default 'rascunho' check (status in ('rascunho', 'aprovada')),
  add column if not exists aprovado_por      uuid,
  add column if not exists aprovado_em       timestamptz,
  add column if not exists rascunho_ia       boolean not null default false;

-- "Todos", "Todo o escritório" e "Todos os mecânicos" são grupos, não funções (sem ficha própria).
insert into public.org_funcoes (funcao, tipo) values ('Todos', 'grupo'), ('Todo o escritório', 'grupo')
on conflict (funcao) do update set tipo = 'grupo';

notify pgrst, 'reload schema';

-- Conferência:
--   select funcao, tipo, status, titulo from org_funcoes order by 1;
