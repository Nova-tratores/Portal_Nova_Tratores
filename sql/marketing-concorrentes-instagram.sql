-- =============================================================================
-- Radar dos concorrentes no Instagram (27/11/2026). José: "preciso de uma engine ou robô inteligente para fazer
-- métricas com o que eles postam e comparar com o nosso".
-- A conta de Instagram da Nova (já ligada pela Meta) lê os perfis comerciais públicos dos concorrentes
-- (Business Discovery). Todo dia o robô guarda os números e os últimos posts; toda segunda a IA escreve a análise.
-- Rodar no projeto do portal (citrhumdkfivdzbmayde). Pode rodar de novo sem estragar nada.
-- =============================================================================

-- Quem acompanhar. tipo: 'nos' (a própria Nova, para comparar), 'marca' ou 'revenda'.
create table if not exists mkt_rivais (
  username      text primary key,               -- @ do Instagram, sem o @
  nome          text,
  tipo          text not null default 'marca' check (tipo in ('nos', 'marca', 'revenda')),
  ativo         boolean not null default true,
  seguidores    integer,
  posts_total   integer,
  foto          text,
  erro          text,                           -- último erro da coleta (ex.: @ não existe ou não é conta comercial)
  coletado_em   timestamptz,
  criado_por    text,
  criado_em     timestamptz not null default now()
);

-- Um retrato por dia (para ver o crescimento de seguidores).
create table if not exists mkt_rivais_dia (
  username     text not null references mkt_rivais (username) on delete cascade,
  dia          date not null,
  seguidores   integer,
  posts_total  integer,
  primary key (username, dia)
);

-- Os posts (os últimos 50 de cada um, atualizados todo dia: curtidas e comentários mudam).
create table if not exists mkt_rivais_posts (
  id            text primary key,               -- id do post no Instagram
  username      text not null references mkt_rivais (username) on delete cascade,
  quando        timestamptz not null,
  tipo          text,                           -- FOTO | CARROSSEL | REELS | VIDEO
  curtidas      integer,
  comentarios   integer,
  legenda       text,
  link          text,
  imagem        text,                           -- miniatura (o link do Instagram vence em alguns dias; a coleta renova)
  atualizado_em timestamptz not null default now()
);
create index if not exists mkt_rivais_posts_quem on mkt_rivais_posts (username, quando desc);

-- A análise da IA (uma por semana).
create table if not exists mkt_rivais_analise (
  semana     date primary key,                  -- segunda-feira da semana
  analise    jsonb not null,
  custo_usd  numeric(8,4),
  criado_em  timestamptz not null default now()
);

alter table mkt_rivais enable row level security;
alter table mkt_rivais_dia enable row level security;
alter table mkt_rivais_posts enable row level security;
alter table mkt_rivais_analise enable row level security;

-- Os concorrentes que já testamos e abrem (27/11/2026). As revendas da região entram pela tela.
insert into mkt_rivais (username, nome, tipo) values
  ('johndeerebrasil',      'John Deere Brasil',      'marca'),
  ('caseihbrasil',         'Case IH Brasil',         'marca'),
  ('masseyfergusonbr',     'Massey Ferguson Brasil', 'marca'),
  ('valtrabrasil',         'Valtra Brasil',          'marca'),
  ('yanmarbrasil',         'YANMAR Brasil',          'marca'),
  ('newhollandag',         'New Holland AG',         'marca')
on conflict (username) do nothing;

-- Todo dia às 06:30 coleta; às segundas também faz a análise da IA (src/lib/marketing/rivais/rivais.ts).
insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, hora, prioridade, usa_omie, duracao_max_min, ativo) values
  ('marketing-rivais', 'marketing-rivais', 'Marketing — radar dos concorrentes', 'Marketing',
   'Lê no Instagram os números e os últimos posts dos concorrentes e da Nova. Às segundas, a IA compara e escreve o que funcionou e ideias para a Nova.',
   'diario', '06:30', 'rapido', false, 10, true)
on conflict (chave) do nothing;

-- Conferir: deve mostrar 6 concorrentes e 1 agendamento.
select (select count(*) from mkt_rivais) as concorrentes, (select count(*) from agendamentos where chave = 'marketing-rivais') as agendamento;
