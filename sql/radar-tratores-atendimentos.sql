-- Radar Tratores (28/10/2026): atendimento EM ANDAMENTO. "Iniciar atendimento" na ficha do trator abre
-- uma linha aqui; o registro (radar_tratores_contatos) fecha a linha. Base da aba "Em atendimento agora".
-- Um atendimento aberto por trator (índice único parcial). Escrita só pela rota
-- /api/revisoes/vendidos/atendimentos (service role); RLS ligado sem policy.
-- Projeto Supabase: portal (citrhumdk…). Rodar depois de sql/radar-tratores-contatos.sql.
create table if not exists public.radar_tratores_atendimentos (
  id uuid primary key default gen_random_uuid(),
  chave text not null,
  marco smallint check (marco is null or marco in (30, 60, 90)),
  user_id uuid,
  user_nome text,
  iniciado_em timestamptz not null default now(),
  encerrado_em timestamptz,
  -- 'registrado' (virou contato) | 'cancelado'
  desfecho text check (desfecho is null or desfecho in ('registrado', 'cancelado')),
  contato_id uuid,
  encerrado_por text
);
create unique index if not exists radar_tratores_atendimentos_aberto on public.radar_tratores_atendimentos (chave) where encerrado_em is null;
create index if not exists radar_tratores_atendimentos_iniciado on public.radar_tratores_atendimentos (iniciado_em desc);

alter table public.radar_tratores_atendimentos enable row level security;
revoke all on public.radar_tratores_atendimentos from anon, authenticated;

notify pgrst, 'reload schema';
