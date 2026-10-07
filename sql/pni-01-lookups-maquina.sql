-- ════════════════════════════════════════════════════════════════════
-- Peças Não Identificadas (Opa) — 1/4: cadastros de TIPO e MARCA de máquina
--
-- Não existia lookup para isso no portal: `maquinas.tipo/marca`,
-- `Equipamentos.marca`, `cad_trator.marca` são texto livre e
-- `garantia_montadoras` carrega configuração de garantia. Nome genérico
-- (sem prefixo pni_) de propósito: outros módulos podem usar.
-- NÃO confundir com `familias`/`produto_tipo` (cadastro de PEÇAS do Omie).
--
-- Leitura: qualquer autenticado. Escrita: só pelas RPCs de pni-04 (setor de
-- peças). Idempotente.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.maquina_tipos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (length(btrim(nome)) between 1 and 80),
  ativo       boolean not null default true,
  ordem       int not null default 0,
  criado_por  uuid,
  criado_em   timestamptz not null default now()
);
create unique index if not exists maquina_tipos_nome_uq on public.maquina_tipos (lower(btrim(nome)));

create table if not exists public.maquina_marcas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (length(btrim(nome)) between 1 and 80),
  ativo       boolean not null default true,
  ordem       int not null default 0,
  criado_por  uuid,
  criado_em   timestamptz not null default now()
);
create unique index if not exists maquina_marcas_nome_uq on public.maquina_marcas (lower(btrim(nome)));

alter table public.maquina_tipos  enable row level security;
alter table public.maquina_marcas enable row level security;

drop policy if exists maquina_tipos_select  on public.maquina_tipos;
drop policy if exists maquina_marcas_select on public.maquina_marcas;
create policy maquina_tipos_select  on public.maquina_tipos  for select to authenticated using (true);
create policy maquina_marcas_select on public.maquina_marcas for select to authenticated using (true);

revoke all on public.maquina_tipos, public.maquina_marcas from anon;
revoke insert, update, delete on public.maquina_tipos, public.maquina_marcas from authenticated;

-- Carga inicial (o setor de peças edita depois pela tela)
insert into public.maquina_tipos (nome, ordem) values
  ('Trator', 10), ('Grade aradora', 20), ('Grade niveladora', 21), ('Arado', 22),
  ('Subsolador', 23), ('Enxada rotativa', 24), ('Plantadeira', 30), ('Semeadeira', 31),
  ('Adubadora / Distribuidor', 32), ('Pulverizador', 40), ('Colheitadeira', 50),
  ('Roçadeira', 60), ('Plaina', 61), ('Ensiladeira', 62), ('Carreta agrícola', 70),
  ('Quadriciclo', 80), ('Motor estacionário', 90), ('Implemento (outros)', 99)
on conflict do nothing;

insert into public.maquina_marcas (nome, ordem) values
  ('Mahindra', 1), ('Massey Ferguson', 10), ('John Deere', 10), ('New Holland', 10),
  ('Valtra', 10), ('Case IH', 10), ('Yanmar', 10), ('Agrale', 10), ('LS Tractor', 10),
  ('Jacto', 20), ('Baldan', 20), ('Tatu Marchesan', 20), ('Kuhn', 20), ('Stara', 20),
  ('Ventura', 20), ('Ipacol', 20), ('Piccin', 20), ('Jumil', 20), ('Vence Tudo', 20),
  ('Nogueira', 20), ('Kamaq', 20), ('Lavrale', 20)
on conflict do nothing;

notify pgrst, 'reload schema';
