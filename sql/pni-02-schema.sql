-- ════════════════════════════════════════════════════════════════════
-- Peças Não Identificadas (Opa) — 2/4: enums, sequence, tabelas, histórico
--
-- Substitui a planilha de peças/partes/sobras que ninguém sabe o que são.
-- Fluxo: aguardando_identificacao → identificado → precificado → a_venda
--        → vendido | descartado   (regras de transição nas RPCs, pni-04)
--
-- Todo item tem quem criou / quem mudou o quê: colunas de auditoria +
-- pni_historico alimentado por TRIGGER (status, qualidade, preço, código,
-- exclusão) — a trigger usa auth.uid(), que dentro de RPC SECURITY DEFINER
-- continua sendo quem chamou.
-- Soft delete (deleted_at); nada é apagado fisicamente.
-- Localização física fica para depois: uma coluna `localizacao` entra sem
-- conflito com nada daqui.
-- ════════════════════════════════════════════════════════════════════

do $$ begin
  create type public.pni_qualidade as enum ('nao_avaliada', 'nova', 'usada_boa', 'usada_com_avaria', 'sucata');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.pni_status as enum ('aguardando_identificacao', 'identificado', 'precificado', 'a_venda', 'vendido', 'descartado');
exception when duplicate_object then null; end $$;

create sequence if not exists public.pni_codigo_seq;

create table if not exists public.pni_itens (
  id                    uuid primary key default gen_random_uuid(),
  codigo                text not null default ('PNI-' || lpad(nextval('public.pni_codigo_seq')::text, 6, '0')),
  codigo_fabricante     text,
  descricao             text,
  quantidade            int not null default 1 check (quantidade > 0),
  qualidade             public.pni_qualidade not null default 'nao_avaliada',
  status                public.pni_status not null default 'aguardando_identificacao',
  nao_identificavel     boolean not null default false,
  preco_sugerido        numeric(12,2) check (preco_sugerido is null or preco_sugerido >= 0),
  motivo_descarte       text,
  observacoes           text,
  etiqueta_impressa_em  timestamptz,
  criado_por            uuid not null,
  criado_em             timestamptz not null default now(),
  atualizado_por        uuid,
  atualizado_em         timestamptz not null default now(),
  deleted_at            timestamptz,
  deleted_por           uuid,
  -- código: sem espaço nas pontas, até 40 caracteres
  constraint pni_itens_codigo_formato check (codigo = btrim(codigo) and length(codigo) between 1 and 40),
  -- rede de segurança das regras de status (a validação "de verdade", com
  -- mensagem amigável, está nas RPCs)
  constraint pni_itens_descricao_ok check (
    status = 'aguardando_identificacao' or nao_identificavel or length(btrim(coalesce(descricao, ''))) > 0),
  constraint pni_itens_preco_ok check (
    status not in ('precificado', 'a_venda', 'vendido') or preco_sugerido is not null),
  constraint pni_itens_descarte_ok check (
    status <> 'descartado' or length(btrim(coalesce(motivo_descarte, ''))) > 0)
);
-- código único sem diferenciar maiúscula, valendo também para itens excluídos
-- (a etiqueta já foi impressa — o código não volta a circular)
create unique index if not exists pni_itens_codigo_uq on public.pni_itens (upper(codigo));
create index if not exists pni_itens_status_idx on public.pni_itens (status, criado_em) where deleted_at is null;

create table if not exists public.pni_fotos (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.pni_itens(id),
  storage_path  text not null unique,
  ordem         int not null,
  criado_por    uuid not null,
  criado_em     timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists pni_fotos_item_idx on public.pni_fotos (item_id, ordem);

create table if not exists public.pni_aplicacoes (
  id               uuid primary key default gen_random_uuid(),
  item_id          uuid not null references public.pni_itens(id),
  tipo_maquina_id  uuid not null references public.maquina_tipos(id),
  marca_id         uuid references public.maquina_marcas(id),   -- nulo = qualquer marca
  criado_por       uuid not null,
  criado_em        timestamptz not null default now(),
  deleted_at       timestamptz,
  deleted_por      uuid
);
create unique index if not exists pni_aplicacoes_uq
  on public.pni_aplicacoes (item_id, tipo_maquina_id, coalesce(marca_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where deleted_at is null;
create index if not exists pni_aplicacoes_item_idx on public.pni_aplicacoes (item_id) where deleted_at is null;

create table if not exists public.pni_historico (
  id        bigint generated always as identity primary key,
  item_id   uuid not null references public.pni_itens(id),
  campo     text not null check (campo in ('criacao', 'status', 'qualidade', 'preco', 'codigo', 'exclusao')),
  de        text,
  para      text,
  motivo    text,
  usuario   uuid,
  em        timestamptz not null default now()
);
create index if not exists pni_historico_item_idx on public.pni_historico (item_id, em);

-- ── Histórico por trigger ───────────────────────────────────────────
create or replace function public.pni_tg_historico()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := coalesce(auth.uid(), new.atualizado_por, new.criado_por);
begin
  if tg_op = 'INSERT' then
    insert into pni_historico (item_id, campo, de, para, usuario)
    values (new.id, 'criacao', null, new.status::text, new.criado_por);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into pni_historico (item_id, campo, de, para, motivo, usuario)
    values (new.id, 'status', old.status::text, new.status::text,
            case when new.status = 'descartado' then new.motivo_descarte end, v_user);
  end if;
  if new.qualidade is distinct from old.qualidade then
    insert into pni_historico (item_id, campo, de, para, usuario)
    values (new.id, 'qualidade', old.qualidade::text, new.qualidade::text, v_user);
  end if;
  if new.preco_sugerido is distinct from old.preco_sugerido then
    insert into pni_historico (item_id, campo, de, para, usuario)
    values (new.id, 'preco', old.preco_sugerido::text, new.preco_sugerido::text, v_user);
  end if;
  if new.codigo is distinct from old.codigo then
    insert into pni_historico (item_id, campo, de, para, usuario)
    values (new.id, 'codigo', old.codigo, new.codigo, v_user);
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    insert into pni_historico (item_id, campo, de, para, usuario)
    values (new.id, 'exclusao', old.status::text, null, coalesce(new.deleted_por, v_user));
  end if;
  return new;
end $$;

drop trigger if exists pni_itens_historico on public.pni_itens;
create trigger pni_itens_historico
  after insert or update on public.pni_itens
  for each row execute function public.pni_tg_historico();

notify pgrst, 'reload schema';
