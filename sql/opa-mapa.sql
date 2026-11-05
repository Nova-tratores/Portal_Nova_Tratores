-- ════════════════════════════════════════════════════════════════════
-- Opa → Mapa: a planta da loja por andar com os territórios (05/11/2026)
--   • opa_mapa_andares: cada andar tem a SUA planta (blocos = áreas/paredes
--     desenhadas pelo admin, em % da planta). Térreo nasce com os blocos do
--     mapa do Pátio (/visual-estoque/patio); 2º andar nasce vazio.
--   • opa_local_mapa: onde fica cada lugar (pni_locais) — andar + retângulo em %.
-- Leitura: quem está logado. Escrita: só pela API (/api/opa/mapa, admin).
-- Sem esta migration a aba Mapa avisa e o resto do Opa segue igual. Idempotente.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.opa_mapa_andares (
  id            text primary key,                 -- 'terreo', 'andar_2'…
  nome          text not null check (length(btrim(nome)) between 1 and 40),
  ordem         int not null default 0,           -- 0 = térreo, 1 = 2º andar… (subir = ordem + 1)
  blocos        jsonb not null default '[]',      -- [{id, nome, x, y, w, h}] em % da planta
  ativo         boolean not null default true,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

create table if not exists public.opa_local_mapa (
  local_id       text primary key references public.pni_locais(id) on delete cascade,
  andar_id       text not null references public.opa_mapa_andares(id) on delete cascade,
  x numeric not null check (x between 0 and 100),
  y numeric not null check (y between 0 and 100),
  w numeric not null check (w > 0 and w <= 100),
  h numeric not null check (h > 0 and h <= 100),
  atualizado_em  timestamptz not null default now(),
  atualizado_por text
);

alter table public.opa_mapa_andares enable row level security;
alter table public.opa_local_mapa enable row level security;
drop policy if exists opa_mapa_andares_select on public.opa_mapa_andares;
create policy opa_mapa_andares_select on public.opa_mapa_andares for select to authenticated using (true);
drop policy if exists opa_local_mapa_select on public.opa_local_mapa;
create policy opa_local_mapa_select on public.opa_local_mapa for select to authenticated using (true);
revoke all on public.opa_mapa_andares from anon;
revoke all on public.opa_local_mapa from anon;
revoke insert, update, delete, truncate on public.opa_mapa_andares from authenticated;
revoke insert, update, delete, truncate on public.opa_local_mapa from authenticated;

-- térreo com os blocos do mapa do Pátio; 2º andar vazio para desenhar
insert into public.opa_mapa_andares (id, nome, ordem, blocos) values
  ('terreo', 'Térreo', 0, '[
    {"id":"patio","nome":"Pátio","x":2.5,"y":4.5,"w":42.5,"h":93},
    {"id":"oficina","nome":"Oficina","x":46,"y":4.5,"w":51.5,"h":27},
    {"id":"showroom","nome":"Showroom","x":46,"y":33,"w":40.5,"h":64.5},
    {"id":"oficina2","nome":"Oficina 2","x":87.5,"y":33,"w":10,"h":64.5}
  ]'::jsonb),
  ('andar_2', '2º andar', 1, '[]'::jsonb)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
