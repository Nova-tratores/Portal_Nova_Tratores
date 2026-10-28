-- Ajustes do tempário Mahindra (José, 28/10/2026): "deixar o usuário atualizar o tempário ou incluir coisas de algo
-- parecido que já tem". O tempário base continua no código (src/lib/mecanicos/dados/tempario-mahindra-v1.json);
-- esta tabela guarda só o que a equipe mudou:
--   base_i preenchido → muda o tempo/descrição daquela atividade do tempário base (vale o ajuste ativo mais novo)
--   base_i nulo        → atividade NOVA (opcionalmente "baseado_em" uma parecida do base)
-- Escrita só pela rota /api/mecanicos/tempario (service role). Idempotente.

create table if not exists public.mecanicos_tempario_ajustes (
  id bigserial primary key,
  base_i integer,
  baseado_em integer,
  codigo text,
  sistema text,
  subsistema text,
  atividade text not null check (length(trim(atividade)) > 0),
  minutos integer check (minutos is null or (minutos > 0 and minutos <= 6000)),
  motivo text not null check (length(trim(motivo)) > 0),
  os_origem text,
  criado_por text not null,
  criado_por_id uuid,
  criado_em timestamptz not null default now(),
  ativo boolean not null default true
);
create index if not exists mecanicos_tempario_ajustes_base on public.mecanicos_tempario_ajustes (base_i) where ativo;

alter table public.mecanicos_tempario_ajustes enable row level security;
revoke all on public.mecanicos_tempario_ajustes from anon, authenticated;
notify pgrst, 'reload schema';
