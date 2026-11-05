-- ════════════════════════════════════════════════════════════════════
-- Opa: departamento OCULTO, vindo do território, e o gestor de cada um
-- (05/11/2026, decisão do José)
--   • quem abre o Opa só escolhe o território (pni_locais — o mesmo de Peças
--     S/Estoque e Patrimônio);
--   • opa_local_departamento liga cada local a um departamento;
--   • o gestor do departamento vira o Responsável do Opa e é o ÚNICO avisado;
--   • local sem departamento cai no departamento marcado como padrão ("Geral").
-- Escrita só pela API (/api/opa/departamentos, service role, admin);
-- leitura liberada a quem está logado. pni_locais NÃO é alterada.
-- Sem esta migration o Opa funciona como antes (aviso para todos).
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.opa_departamentos (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (length(btrim(nome)) between 1 and 60),
  gestor_id     uuid,            -- financeiro_usu.id / auth.users.id
  gestor_nome   text,            -- retrato do nome (aparece no Responsável do Opa)
  padrao        boolean not null default false,  -- recebe os locais sem departamento
  ativo         boolean not null default true,
  ordem         int not null default 100,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- um nome ATIVO por vez (sem caixa) e um só padrão
create unique index if not exists opa_departamentos_nome_ativo
  on public.opa_departamentos (lower(btrim(nome))) where ativo;
create unique index if not exists opa_departamentos_um_padrao
  on public.opa_departamentos ((true)) where padrao and ativo;

create table if not exists public.opa_local_departamento (
  local_id        text primary key references public.pni_locais(id) on delete cascade,
  departamento_id uuid not null references public.opa_departamentos(id) on delete cascade,
  atualizado_em   timestamptz not null default now(),
  atualizado_por  text
);

-- o Opa guarda a qual departamento foi (o nome continua em portal_opas.departamento)
alter table public.portal_opas add column if not exists departamento_id uuid;

alter table public.opa_departamentos enable row level security;
alter table public.opa_local_departamento enable row level security;

drop policy if exists opa_departamentos_select on public.opa_departamentos;
create policy opa_departamentos_select on public.opa_departamentos for select to authenticated using (true);
drop policy if exists opa_local_departamento_select on public.opa_local_departamento;
create policy opa_local_departamento_select on public.opa_local_departamento for select to authenticated using (true);

revoke all on public.opa_departamentos from anon;
revoke all on public.opa_local_departamento from anon;
revoke insert, update, delete, truncate on public.opa_departamentos from authenticated;
revoke insert, update, delete, truncate on public.opa_local_departamento from authenticated;

-- departamento "Geral" (padrão) já nasce; o gestor é escolhido na tela /opa/departamentos
insert into public.opa_departamentos (nome, padrao, ordem)
select 'Geral', true, 0
where not exists (select 1 from public.opa_departamentos where padrao and ativo);

notify pgrst, 'reload schema';
