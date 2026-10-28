-- Radar de tratores (Feedbacks → Tratores, 27/10/2026): registro das ligações dos 30/60/90 dias
-- depois da venda do trator novo. Uma linha por tentativa/conversa. `chave` = a do trator vendido
-- (lib/revisoes/vendidos-server.ts: "EMPRESA|pedido|chassi"). Escrita só pela rota
-- /api/revisoes/vendidos/contatos (service role); RLS ligado sem policy.
-- Projeto Supabase: portal (citrhumdk…).
create table if not exists public.radar_tratores_contatos (
  id uuid primary key default gen_random_uuid(),
  chave text not null,
  marco smallint not null check (marco in (30, 60, 90)),
  resultado text not null check (resultado in ('tudo_certo', 'problema', 'agendou_50h', 'quer_peca', 'nao_atendeu', 'dispensado')),
  nota text,
  user_id uuid,
  user_nome text,
  criado_em timestamptz not null default now()
);
create index if not exists radar_tratores_contatos_chave on public.radar_tratores_contatos (chave, criado_em desc);
create index if not exists radar_tratores_contatos_criado on public.radar_tratores_contatos (criado_em desc);

alter table public.radar_tratores_contatos enable row level security;
revoke all on public.radar_tratores_contatos from anon, authenticated;

notify pgrst, 'reload schema';
