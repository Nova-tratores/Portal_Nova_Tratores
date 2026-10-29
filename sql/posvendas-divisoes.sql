-- Divisão de OS entre técnicos salva na hora (José, 29/10/2026: "tem que salvar para o usuário ter certeza de que foi").
-- Projeto: PORTAL (citrhumdk…). Uma linha por OS do mês: quem dividiu, as horas e o valor de cada técnico.
-- A ficha de quem recebeu mostra a OS em roxo a partir daqui; o pedido ao diretor continua levando a divisão.
create table if not exists public.posvendas_divisoes (
  id bigserial primary key,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  os text not null,
  numero text not null,
  de_tecnico text not null,
  horas jsonb,
  valores jsonb not null,
  motivo text not null default '',
  salvo_por text,
  salvo_por_id uuid,
  atualizado_em timestamptz not null default now(),
  unique (mes, numero)
);
create index if not exists posvendas_divisoes_mes on public.posvendas_divisoes (mes);
alter table public.posvendas_divisoes enable row level security;
revoke all on public.posvendas_divisoes from anon, authenticated;
notify pgrst, 'reload schema';
