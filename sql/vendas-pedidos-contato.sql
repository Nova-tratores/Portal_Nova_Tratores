-- ============================================================================
-- Pedido de contato do vendedor ao suporte (app de vendas → Mariano) — 11/11/2026
-- ----------------------------------------------------------------------------
-- O vendedor abre a quest/o negócio, não acha telefone/celular/endereço e
-- aperta "Pedir ao suporte". Antes: só uma notificação no sino do Mariano,
-- sem lugar para responder. Agora: o pedido vira uma linha aqui; o sino abre
-- /crm-vendas/pedidos-contato?id=<id> onde o Mariano preenche telefone,
-- celular, endereço e localização; a resposta entra no contato da quest/do
-- negócio (e das outras quests do mesmo cliente/chassi) e o vendedor recebe
-- um recado em mensagens_vendedor com o link para a quest.
-- Escrita/leitura só pelo portal (service role): RLS ligado, sem policy.
-- Sem esta migration: o pedido continua indo ao sino como antes e o contato
-- da quest funciona igual (só sem a resposta do suporte).
-- https://supabase.com/dashboard/project/citrhumdkfivdzbmayde/sql/new
-- ============================================================================
create table if not exists public.vendas_pedidos_contato (
  id             bigint generated always as identity primary key,
  quest_id       bigint,
  negocio_id     bigint,
  vendedor_id    bigint,                 -- quem recebe o aviso da resposta (null = pedido do supervisor)
  pedido_por     text not null,          -- nome de quem pediu
  falta          text[] not null default '{}',  -- telefone | whatsapp | endereco
  obs            text,                   -- recado do vendedor
  alvo           text,                   -- "Cliente · Trator …123456" (texto do pedido)
  cliente_nome   text,
  cliente_cod    bigint,                 -- cod_cli do cadastro Omie, quando se sabe
  cliente_doc    text,
  chassis        text,
  cidade         text,
  suporte_id     uuid,                   -- quem foi avisado (financeiro_usu / auth.users)
  status         text not null default 'aberto' check (status in ('aberto', 'respondido', 'dispensado')),
  -- resposta do suporte
  telefone       text,
  celular        text,
  endereco       text,
  lat            double precision,
  lng            double precision,
  resposta_obs   text,
  respondido_por text,
  respondido_em  timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists vendas_pedidos_contato_status  on public.vendas_pedidos_contato (status, created_at desc);
create index if not exists vendas_pedidos_contato_quest   on public.vendas_pedidos_contato (quest_id);
create index if not exists vendas_pedidos_contato_negocio on public.vendas_pedidos_contato (negocio_id);
create index if not exists vendas_pedidos_contato_cliente on public.vendas_pedidos_contato (cliente_cod) where status = 'respondido';
create index if not exists vendas_pedidos_contato_chassi  on public.vendas_pedidos_contato (chassis) where status = 'respondido';

alter table public.vendas_pedidos_contato enable row level security;
revoke all on public.vendas_pedidos_contato from anon, authenticated;

notify pgrst, 'reload schema';
