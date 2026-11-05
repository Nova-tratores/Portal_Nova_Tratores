-- Decisões da comissão salvas na hora (José, 05/11/2026: "toda vez que fazemos alguma alteração na comissão ela não
-- está salvando e muito menos descontando o valor"). Projeto: PORTAL (citrhumdk…). Uma linha por técnico no mês:
-- pagar / não pagar / ajustar de cada OS (a divisão continua em posvendas_divisoes) e os descontos ainda não pedidos.
-- A ficha abre com elas e o cartão do técnico mostra a comissão já com as decisões.
create table if not exists public.posvendas_comissao_decisoes (
  id bigserial primary key,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  tecnico text not null,
  decisoes jsonb not null default '{}'::jsonb,
  descontos jsonb not null default '[]'::jsonb,
  salvo_por text,
  salvo_por_id uuid,
  atualizado_em timestamptz not null default now(),
  unique (mes, tecnico)
);
create index if not exists posvendas_comissao_decisoes_mes on public.posvendas_comissao_decisoes (mes);
alter table public.posvendas_comissao_decisoes enable row level security;
revoke all on public.posvendas_comissao_decisoes from anon, authenticated;
notify pgrst, 'reload schema';
