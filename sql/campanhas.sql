-- CAMPANHAS (módulo Site → Campanhas) — José, 13/11/2026
-- RODAR NO PROJETO DO PORTAL: citrhumdkfivdzbmayde
-- Serve para qualquer campanha (nome + ano). A primeira é a Black Friday 2026: página solta com
-- apresentação → regras → ficha + foto de trator Mahindra → roleta por setor (comercial, posvendas, pecas).
--
-- A página do cliente (Projetos\black-friday-roleta) usa só a chave pública e estas funções:
--   campanha_dados(slug, setor)  → nome, datas, regras e prêmios da roleta
--   campanha_inscrever(...)      → grava a ficha (1 por aparelho em cada setor)
--   campanha_girar(id, aparelho) → sorteia no servidor (chance + limite de cada prêmio)
-- A foto vai para o Storage, pasta privada "campanhas" (o portal mostra com link temporário).

create table if not exists campanhas (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,                 -- usado no link: black-friday-2026
  nome       text not null,                        -- Black Friday
  ano        int  not null,
  inicio     date not null,
  fim        date not null,                        -- último dia que vale
  ativo      boolean not null default true,
  url        text,                                 -- endereço da página (para copiar os links dos setores)
  config     jsonb not null default '{}'::jsonb,   -- textos: premio_foto, validade, etc.
  criado_em  timestamptz not null default now()
);

create table if not exists campanha_premios (
  id           bigserial primary key,
  campanha_id  uuid not null references campanhas(id) on delete cascade,
  setor        text not null check (setor in ('comercial','posvendas','pecas')),
  rotulo       text not null,          -- texto curto da fatia
  nome         text not null,          -- texto completo
  detalhe      text,                   -- regra do prêmio
  peso         int  not null default 1 check (peso >= 0),  -- chance relativa
  estoque      int,                    -- máximo de vezes (vazio = sem limite)
  ordem        int  not null default 0,
  ativo        boolean not null default true,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create index if not exists campanha_premios_idx on campanha_premios (campanha_id, setor, ordem);

create table if not exists campanha_participacoes (
  id              uuid primary key default gen_random_uuid(),
  campanha_id     uuid not null references campanhas(id) on delete cascade,
  setor           text not null,
  criado_em       timestamptz not null default now(),
  nome            text not null,
  cidade          text,
  lat             double precision,
  lng             double precision,
  precisao_m      double precision,
  tem_trator      boolean not null,
  modelo          text,
  foto_path       text,                -- caminho no bucket campanhas
  foto_vencedora  boolean not null default false,
  extras          jsonb not null default '{}'::jsonb,   -- campos que entrarem depois
  aparelho        text not null,
  premio_id       bigint references campanha_premios(id) on delete set null,
  premio_nome     text,
  codigo          text unique,
  girou_em        timestamptz,
  resgatado_em    timestamptz,
  resgatado_por   text,
  unique (campanha_id, aparelho, setor)
);
create index if not exists campanha_participacoes_idx on campanha_participacoes (campanha_id, criado_em desc);

-- tudo fechado para fora; o portal lê com a chave de serviço e a página usa as funções abaixo
alter table campanhas enable row level security;
alter table campanha_premios enable row level security;
alter table campanha_participacoes enable row level security;

-- ---------- dados públicos da campanha (para desenhar a página) ----------
create or replace function campanha_dados(p_slug text, p_setor text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'nome', c.nome, 'ano', c.ano, 'inicio', c.inicio, 'fim', c.fim, 'config', c.config,
    'aberta', c.ativo and (now() at time zone 'America/Sao_Paulo')::date between c.inicio and c.fim,
    'premios', coalesce((select json_agg(json_build_object('id', p.id, 'rotulo', p.rotulo, 'nome', p.nome, 'detalhe', p.detalhe) order by p.ordem, p.id)
                         from campanha_premios p where p.campanha_id = c.id and p.setor = p_setor and p.ativo), '[]'::json))
  from campanhas c where c.slug = p_slug;
$$;

-- ---------- ficha ----------
create or replace function campanha_inscrever(
  p_slug text, p_setor text, p_nome text, p_cidade text, p_lat double precision, p_lng double precision,
  p_precisao double precision, p_tem_trator boolean, p_modelo text, p_foto text, p_aparelho text,
  p_extras jsonb default '{}'::jsonb
) returns json language plpgsql security definer set search_path = public as $$
declare
  c campanhas;
  v campanha_participacoes;
begin
  select * into c from campanhas where slug = p_slug;
  if not found then raise exception 'campanha não existe'; end if;
  if not c.ativo or (now() at time zone 'America/Sao_Paulo')::date not between c.inicio and c.fim then
    raise exception 'campanha encerrada';
  end if;
  if p_setor not in ('comercial','posvendas','pecas') then raise exception 'setor inválido'; end if;
  if coalesce(length(trim(p_nome)),0) < 2 or length(p_nome) > 120 then raise exception 'nome inválido'; end if;
  if coalesce(length(p_aparelho),0) < 8 or length(p_aparelho) > 80 then raise exception 'aparelho inválido'; end if;
  if coalesce(c.config->'ficha'->>'pedir_local', 'true') <> 'false'
     and p_lat is null and coalesce(length(trim(p_cidade)),0) < 2 then raise exception 'falta localização'; end if;
  if p_foto is not null and p_foto not like p_slug || '/%' then raise exception 'foto inválida'; end if;

  select * into v from campanha_participacoes where campanha_id = c.id and aparelho = p_aparelho and setor = p_setor;
  if found then
    -- já tinha ficha neste aparelho: atualiza enquanto não girou; depois de girar fica como está
    if v.girou_em is null then
      update campanha_participacoes set nome = trim(p_nome), cidade = nullif(trim(p_cidade),''), lat = p_lat, lng = p_lng,
             precisao_m = p_precisao, tem_trator = p_tem_trator, modelo = case when p_tem_trator then nullif(trim(p_modelo),'') end,
             foto_path = coalesce(p_foto, foto_path), extras = coalesce(p_extras,'{}'::jsonb)
       where id = v.id returning * into v;
    end if;
  else
    insert into campanha_participacoes (campanha_id, setor, nome, cidade, lat, lng, precisao_m, tem_trator, modelo, foto_path, extras, aparelho)
    values (c.id, p_setor, trim(p_nome), nullif(trim(p_cidade),''), p_lat, p_lng, p_precisao, p_tem_trator,
            case when p_tem_trator then nullif(trim(p_modelo),'') end, p_foto, coalesce(p_extras,'{}'::jsonb), p_aparelho)
    returning * into v;
  end if;
  return json_build_object('id', v.id, 'premio_id', v.premio_id, 'premio', v.premio_nome, 'codigo', v.codigo);
end $$;

-- ---------- giro ----------
create or replace function campanha_girar(p_id uuid, p_aparelho text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v campanha_participacoes;
  c campanhas;
  pr campanha_premios;
  v_total int;
  v_sorteio int;
  v_codigo text;
  v_prefixo text;
begin
  select * into v from campanha_participacoes where id = p_id and aparelho = p_aparelho for update;
  if not found then raise exception 'ficha não encontrada'; end if;
  if v.girou_em is not null then
    return json_build_object('premio_id', v.premio_id, 'premio', v.premio_nome, 'codigo', v.codigo, 'repetido', true);
  end if;
  select * into c from campanhas where id = v.campanha_id;
  if not c.ativo or (now() at time zone 'America/Sao_Paulo')::date not between c.inicio and c.fim then
    raise exception 'campanha encerrada';
  end if;

  perform pg_advisory_xact_lock(hashtext('campanha_girar_' || v.campanha_id || v.setor));
  select coalesce(sum(p.peso),0) into v_total from campanha_premios p
   where p.campanha_id = v.campanha_id and p.setor = v.setor and p.ativo and p.peso > 0
     and (p.estoque is null or p.estoque > (select count(*) from campanha_participacoes x where x.premio_id = p.id));
  if v_total = 0 then raise exception 'sem prêmios disponíveis'; end if;

  v_sorteio := floor(random() * v_total)::int;
  for pr in select p.* from campanha_premios p
             where p.campanha_id = v.campanha_id and p.setor = v.setor and p.ativo and p.peso > 0
               and (p.estoque is null or p.estoque > (select count(*) from campanha_participacoes x where x.premio_id = p.id))
             order by p.ordem, p.id
  loop
    v_sorteio := v_sorteio - pr.peso;
    exit when v_sorteio < 0;
  end loop;

  v_prefixo := case v.setor when 'comercial' then 'COM' when 'posvendas' then 'POS' else 'PEC' end;
  loop
    v_codigo := v_prefixo || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
    exit when not exists (select 1 from campanha_participacoes where codigo = v_codigo);
  end loop;

  update campanha_participacoes set premio_id = pr.id, premio_nome = pr.nome, codigo = v_codigo, girou_em = now()
   where id = v.id;
  return json_build_object('premio_id', pr.id, 'premio', pr.nome, 'codigo', v_codigo, 'repetido', false);
end $$;

revoke all on function campanha_dados(text,text) from public;
revoke all on function campanha_inscrever(text,text,text,text,double precision,double precision,double precision,boolean,text,text,text,jsonb) from public;
revoke all on function campanha_girar(uuid,text) from public;
grant execute on function campanha_dados(text,text) to anon, authenticated;
grant execute on function campanha_inscrever(text,text,text,text,double precision,double precision,double precision,boolean,text,text,text,jsonb) to anon, authenticated;
grant execute on function campanha_girar(uuid,text) to anon, authenticated;

-- ---------- fotos: pasta privada, cliente só envia (jpg até 5 MB, dentro da pasta da campanha) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campanhas', 'campanhas', false, 5242880, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];

-- a regra roda como o visitante (sem acesso à tabela campanhas): pergunta por uma função
create or replace function campanha_aberta(p_slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from campanhas c where c.slug = p_slug and c.ativo
                 and (now() at time zone 'America/Sao_Paulo')::date between c.inicio and c.fim);
$$;
grant execute on function campanha_aberta(text) to anon, authenticated;

drop policy if exists campanhas_enviar_foto on storage.objects;
create policy campanhas_enviar_foto on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'campanhas'
              and public.campanha_aberta((storage.foldername(name))[1])
              and lower(storage.extension(name)) = 'jpg');

-- ---------- Black Friday 2026 + prêmios de exemplo (José ajusta na guia Campanhas → Prêmios) ----------
-- config = o que aparece em cada passo da página (editado no portal: Site → Campanhas → O que aparece)
insert into campanhas (slug, nome, ano, inicio, fim, config)
values ('black-friday-2026', 'Black Friday', 2026, '2026-11-01', '2026-11-30', $cfg${
  "premio_foto": "A foto mais bonita ganha um prêmio especial da Nova Tratores.",
  "validade": "31/12/2026",
  "inicio": {
    "subtitulo": "Gire a roleta. Todo giro ganha.",
    "passos": ["Leia as regras", "Preencha a ficha", "Gire e ganhe na hora"],
    "concurso": "Tem Mahindra? A foto mais bonita ganha prêmio."
  },
  "regras": [
    "Vale até 30/11",
    "1 giro por pessoa nesta roleta",
    "Todo giro ganha prêmio",
    "Mostre o código na loja até 31/12",
    "Foto mais bonita do seu Mahindra ganha prêmio"
  ],
  "ficha": {
    "pedir_local": true,
    "pedir_trator": true,
    "pedir_foto": true,
    "modelos": ["2025","5050","6060","6065","6075","6075E","6675F","7095","8110","OJA 3140","Retro VX90","Outro"]
  },
  "whats": { "comercial": "", "posvendas": "", "pecas": "5514997627413" }
}$cfg$::jsonb)
on conflict (slug) do nothing;

insert into campanha_premios (campanha_id, setor, ordem, rotulo, nome, detalhe, peso, estoque)
select c.id, v.* from campanhas c, (values
  ('comercial', 1, 'Revisão 50 h grátis',   'Revisão de 50 horas grátis',             'Na compra de um trator Mahindra novo até 31/12/2026.', 2, null::int),
  ('comercial', 2, 'Boné Mahindra',         'Boné oficial Mahindra',                   'Retirar na loja.', 5, null),
  ('comercial', 3, 'Demonstração',          'Demonstração grátis na sua propriedade',  'Agendar com o vendedor.', 4, null),
  ('comercial', 4, 'R$ 1.000 implemento',   'R$ 1.000 de desconto em implemento',      'Na compra do trator junto com o implemento até 31/12/2026.', 2, 20),
  ('comercial', 5, 'Camiseta Mahindra',     'Camiseta oficial Mahindra',               'Retirar na loja.', 4, null),
  ('comercial', 6, 'Tanque cheio',          'Tanque cheio na entrega',                 'Na compra de um trator Mahindra novo até 31/12/2026.', 1, 10),
  ('posvendas', 1, '10% mão de obra',       '10% de desconto na mão de obra',          'Na próxima revisão ou conserto até 31/12/2026.', 5, null),
  ('posvendas', 2, 'Check-up grátis',       'Check-up grátis do trator',               'Agendar com o Pós-Vendas.', 3, null),
  ('posvendas', 3, 'Deslocamento grátis',   'Deslocamento grátis até 50 km',           'Em um atendimento no campo até 31/12/2026.', 3, null),
  ('posvendas', 4, '15% mão de obra',       '15% de desconto na mão de obra',          'Na próxima revisão ou conserto até 31/12/2026.', 2, null),
  ('posvendas', 5, 'Boné Mahindra',         'Boné oficial Mahindra',                   'Retirar na loja.', 4, null),
  ('posvendas', 6, 'Revisão grátis',        'Mão de obra da revisão grátis',           'Uma revisão até 31/12/2026.', 1, 5),
  ('pecas',     1, '5% em peças',           '5% de desconto em peças',                 'Uma compra até 31/12/2026.', 6, null),
  ('pecas',     2, '10% em peças',          '10% de desconto em peças',                'Uma compra até 31/12/2026.', 4, null),
  ('pecas',     3, 'Frete grátis',          'Frete grátis',                            'Em um pedido de peças até 31/12/2026.', 3, null),
  ('pecas',     4, '15% em peças',          '15% de desconto em peças',                'Uma compra até 31/12/2026.', 2, null),
  ('pecas',     5, 'Filtro grátis',         'Filtro de óleo grátis',                   'Na compra do kit de revisão até 31/12/2026.', 2, 30),
  ('pecas',     6, 'Boné Mahindra',         'Boné oficial Mahindra',                   'Retirar na loja.', 4, null)
) as v(setor, ordem, rotulo, nome, detalhe, peso, estoque)
where c.slug = 'black-friday-2026'
  and not exists (select 1 from campanha_premios p where p.campanha_id = c.id);
