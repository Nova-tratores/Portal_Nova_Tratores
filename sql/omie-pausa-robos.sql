-- Pausa dos robôs do Omie durante o faturamento (21/10/2026).
-- Projeto Supabase do PORTAL (citrhumdk…).
-- Enquanto existir uma linha com "ate" no futuro, as chamadas de robô ao Omie
-- esperam na fila (web e worker). Cada linha expira sozinha em até 10 min.
create table if not exists omie_pausa_robos (
  id        text primary key,
  motivo    text,
  ate       timestamptz not null,
  criado_em timestamptz not null default now()
);
create index if not exists omie_pausa_robos_ate on omie_pausa_robos (ate);

alter table omie_pausa_robos enable row level security;
revoke all on omie_pausa_robos from anon, authenticated;
