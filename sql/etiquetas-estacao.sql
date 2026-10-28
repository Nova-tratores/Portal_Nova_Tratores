-- Estação de impressão da térmica (ROGERIA) — 26/10/2026.
-- Um Chrome sempre aberto no PC da impressora (/estacao-impressao) recebe as
-- etiquetas que qualquer pessoa com acesso às etiquetas manda pela rede (PPV,
-- Opa Peças S/Estoque, Patrimônio) e imprime sem diálogo (--kiosk-printing).
--
-- etiquetas_estacao_fila = um pedido de impressão (várias etiquetas, prontas
--   para o desenho da térmica: o mesmo ItemTermica que a tela imprimiria).
-- etiquetas_estacao      = a estação e o último "estou viva" (online < 90 s).
--
-- Escrita e leitura SÓ pelas rotas /api/etiquetas/estacao* (service role):
-- RLS ligado sem policy + REVOKE. Idempotente.

create table if not exists public.etiquetas_estacao_fila (
  id          bigint generated always as identity primary key,
  origem      text not null check (origem in ('ppv', 'opa', 'patrimonio', 'teste')),
  itens       jsonb not null,
  total       integer not null check (total between 1 and 500),
  status      text not null default 'pendente'
              check (status in ('pendente', 'imprimindo', 'impressa', 'erro', 'cancelada')),
  erro        text,
  criado_por  uuid,
  criado_nome text,
  criado_em   timestamptz not null default now(),
  pego_em     timestamptz,
  impresso_em timestamptz
);
create index if not exists etiquetas_estacao_fila_status_idx on public.etiquetas_estacao_fila (status, criado_em);
create index if not exists etiquetas_estacao_fila_criado_idx on public.etiquetas_estacao_fila (criado_em desc);

create table if not exists public.etiquetas_estacao (
  id           text primary key,
  nome         text not null,
  ultimo_sinal timestamptz,
  sinal_por    uuid,
  sinal_nome   text,
  info         jsonb not null default '{}'::jsonb
);
insert into public.etiquetas_estacao (id, nome) values ('termica', 'ROGERIA') on conflict (id) do nothing;

alter table public.etiquetas_estacao_fila enable row level security;
alter table public.etiquetas_estacao enable row level security;
revoke all on public.etiquetas_estacao_fila from anon, authenticated;
revoke all on public.etiquetas_estacao from anon, authenticated;

notify pgrst, 'reload schema';
