-- Rodar no projeto citrhumdkfivdzbmayde (PORTAL).
-- Controlador de fases do POS e do PPV (José, 09/11/2026): cada quadro guarda a SUA lista de fases, em ordem.
-- `fases` = [{ "chave": "Orçamento", "rotulo": "Orçamentos" }, { "chave": "Fase nova" }, …]
--   chave  = valor gravado no Status da OS / do PPV (nunca muda depois de criada)
--   rotulo = nome mostrado (opcional; sem ele mostra a chave)
-- Sem linha para o quadro = as fases de sempre + os nomes da fases_rotulos (lápis antigo).
-- Escrita só pela rota /api/fases/quadro (service role), que confere permissão e fase vazia antes de remover.

create table if not exists public.fases_quadro (
  modulo         text primary key check (modulo in ('pos', 'ppv')),
  fases          jsonb not null check (jsonb_typeof(fases) = 'array'),
  atualizado_por text,
  atualizado_em  timestamptz not null default now()
);

alter table public.fases_quadro enable row level security;
revoke all on public.fases_quadro from anon, authenticated;

notify pgrst, 'reload schema';
