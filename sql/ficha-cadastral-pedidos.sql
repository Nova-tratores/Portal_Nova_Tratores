-- Mudanças na ficha cadastral passam pelo Diretor (09/11/2026).
-- Projeto: PORTAL (citrhumdk…). Rodar uma vez.
-- Cada pessoa tem no máximo UM pedido pendente por vez (quem edita de novo
-- atualiza o mesmo pedido). Só o servidor lê e grava (RLS sem política).

create table if not exists public.usuario_ficha_pedidos (
  id               bigserial primary key,
  user_id          uuid not null,            -- dono da ficha
  user_nome        text,
  dados            jsonb not null,           -- ficha inteira como vai ficar
  mudancas         jsonb not null default '[]'::jsonb,
  pedido_por       uuid not null,
  pedido_por_nome  text,
  status           text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
  decidido_por     uuid,
  decidido_por_nome text,
  decidido_em      timestamptz,
  motivo           text,
  rh               jsonb,                    -- o que foi enviado ao RH ao aprovar
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

create unique index if not exists usuario_ficha_pedidos_um_pendente
  on public.usuario_ficha_pedidos (user_id) where status = 'pendente';
create index if not exists usuario_ficha_pedidos_status on public.usuario_ficha_pedidos (status, criado_em desc);

alter table public.usuario_ficha_pedidos enable row level security;
revoke all on public.usuario_ficha_pedidos from anon, authenticated;
