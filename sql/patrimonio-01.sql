-- ════════════════════════════════════════════════════════════════════
-- Patrimônio Loja (aba do Opa) — 01: cadastro (13/10/2026). Idempotente.
--
-- Pedido do José: registrar o que a LOJA tem (ferramentas, informática,
-- móveis, equipamentos…): descrição, marca/modelo, estado, valor, onde está,
-- com quem, tags, fotos — e o histórico de por onde o item passou.
-- Sugestão de preço pela internet e baixa (destino) ficam para a fase 2.
--
-- Permissão: módulo 'patrimonio' (Administração). Quem já tinha 'opa-pecas'
-- recebe o módulo aqui (no fim do arquivo) — depois cada um é liberado ou
-- bloqueado na Administração. Admin/Dev sempre podem.
-- Tudo é lido e gravado pelas rotas /api/patrimonio/* (service role); as
-- tabelas ficam com RLS ligado e SEM policy. Fotos: bucket privado
-- 'patrimonio-fotos' (sobe na pasta do próprio usuário; lê por URL assinada).
-- Locais: a MESMA lista do Opa Peças (pni_locais, inclusive "criar local").
-- ════════════════════════════════════════════════════════════════════

-- ── quem pode ───────────────────────────────────────────────────────
create or replace function public.patrimonio_pode()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from portal_permissoes pp
    where pp.user_id = auth.uid()
      and (pp.is_admin is true or pp.is_dev is true
           or 'patrimonio' = any(coalesce(pp.modulos_permitidos, '{}'))
           or exists (select 1 from unnest(coalesce(pp.modulos_permitidos, '{}')) m where m like 'patrimonio:%'))
  )
$$;
revoke all on function public.patrimonio_pode() from public, anon;
grant execute on function public.patrimonio_pode() to authenticated, service_role;

-- ── itens ───────────────────────────────────────────────────────────
create sequence if not exists public.patrimonio_seq;

create table if not exists public.patrimonio_itens (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null unique default ('PAT-' || lpad(nextval('public.patrimonio_seq')::text, 6, '0')),
  descricao      text not null check (length(descricao) between 1 and 300),
  categoria      text check (length(categoria) <= 60),
  marca          text check (length(marca) <= 80),
  modelo         text check (length(modelo) <= 120),
  numero_serie   text check (length(numero_serie) <= 120),
  estado         text not null default 'bom' check (estado in ('novo', 'bom', 'regular', 'ruim', 'sem_uso')),
  situacao       text not null default 'em_uso' check (situacao in ('em_uso', 'guardado', 'emprestado', 'manutencao', 'baixado')),
  -- onde está agora (mesma lista de locais do Opa Peças) e com quem
  local_id       text references public.pni_locais(id),
  local_tecnico  text check (length(local_tecnico) <= 120),
  responsavel    text check (length(responsavel) <= 120),
  -- valores
  valor_atual    numeric(14, 2) check (valor_atual >= 0),
  valor_compra   numeric(14, 2) check (valor_compra >= 0),
  data_compra    date,
  fornecedor     text check (length(fornecedor) <= 160),
  nota_fiscal    text check (length(nota_fiscal) <= 80),
  garantia_ate   date,
  tags           text[] not null default '{}',
  observacoes    text check (length(observacoes) <= 2000),
  criado_por     uuid,
  criado_em      timestamptz not null default now(),
  atualizado_por uuid,
  atualizado_em  timestamptz not null default now(),
  deleted_at     timestamptz
);
create index if not exists patrimonio_itens_local_idx on public.patrimonio_itens (local_id) where deleted_at is null;
create index if not exists patrimonio_itens_tags_idx on public.patrimonio_itens using gin (tags);

create table if not exists public.patrimonio_fotos (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.patrimonio_itens(id) on delete cascade,
  storage_path text not null,
  ordem        int not null default 0,
  criado_em    timestamptz not null default now()
);
create index if not exists patrimonio_fotos_item_idx on public.patrimonio_fotos (item_id, ordem);

-- por onde o item passou (cadastro inicial = 1ª linha, de_* nulos)
create table if not exists public.patrimonio_movimentacoes (
  id                 uuid primary key default gen_random_uuid(),
  item_id            uuid not null references public.patrimonio_itens(id) on delete cascade,
  de_local_id        text,
  de_local_tecnico   text,
  de_responsavel     text,
  para_local_id      text,
  para_local_tecnico text,
  para_responsavel   text,
  situacao           text,
  motivo             text check (length(motivo) <= 500),
  por                uuid,
  por_nome           text,
  em                 timestamptz not null default now()
);
create index if not exists patrimonio_mov_item_idx on public.patrimonio_movimentacoes (item_id, em desc);

-- só as rotas (service role) leem e gravam
do $$
declare t text;
begin
  foreach t in array array['patrimonio_itens', 'patrimonio_fotos', 'patrimonio_movimentacoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on sequence public.patrimonio_seq from anon, authenticated;

-- ── fotos: bucket privado ───────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('patrimonio-fotos', 'patrimonio-fotos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists patrimonio_fotos_upload on storage.objects;
drop policy if exists patrimonio_fotos_ler    on storage.objects;
create policy patrimonio_fotos_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'patrimonio-fotos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.patrimonio_pode()
  );
create policy patrimonio_fotos_ler on storage.objects for select to authenticated
  using (bucket_id = 'patrimonio-fotos' and public.patrimonio_pode());

-- ── quem já tinha Opa Peças ganha o Patrimônio (uma vez) ─────────────
update public.portal_permissoes
set modulos_permitidos = array_append(coalesce(modulos_permitidos, '{}'), 'patrimonio')
where 'opa-pecas' = any(coalesce(modulos_permitidos, '{}'))
  and not ('patrimonio' = any(coalesce(modulos_permitidos, '{}')));

notify pgrst, 'reload schema';
