-- Organograma (aba Processos de /atividades → "Organograma"): quem responde a quem.
-- As caixas (nome, foto, cargo, setor, empresa) vêm do portal (financeiro_usu) e do RH; esta
-- tabela guarda SÓ o que nenhum sistema tinha: o chefe de cada pessoa. Chave = 'u:<auth uid>'
-- (usuário do portal) ou 'rh:<id do RH>' (funcionário sem login no portal).
-- Escrita só pela rota /api/organograma (service role, admin); RLS ligado sem policy.
-- Sem este SQL a tela mostra as pessoas, todas em "a posicionar", e não deixa salvar.
-- Idempotente.

create table if not exists public.org_pessoas (
  pessoa_chave    text primary key check (pessoa_chave ~ '^(u|rh):.+$'),
  gestor_chave    text check (gestor_chave is null or gestor_chave ~ '^(u|rh):.+$'),
  -- topo = está no alto do organograma de propósito (sem chefe). Sem linha, ou sem chefe e
  -- sem topo, a pessoa aparece em "a posicionar".
  topo            boolean not null default false,
  -- fora = não entra no organograma (conta de teste, estação de impressão, quem saiu…)
  fora            boolean not null default false,
  cargo           text check (cargo is null or char_length(cargo) <= 80),   -- sobrescreve o do RH/portal
  ordem           int not null default 0,
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid,
  check (gestor_chave is null or gestor_chave <> pessoa_chave),
  check (not (topo and gestor_chave is not null))
);

create index if not exists org_pessoas_gestor_idx on public.org_pessoas (gestor_chave);

alter table public.org_pessoas enable row level security;
revoke all on public.org_pessoas from anon, authenticated;

notify pgrst, 'reload schema';

-- Conferência:
--   select count(*) from org_pessoas;   -- 0 até alguém posicionar a 1ª pessoa na tela
