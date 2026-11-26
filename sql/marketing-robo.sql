-- =============================================================================
-- Robô dos posts (26/11/2026): o caderno do robô. Uma linha por "vaga" que ele preencheu no calendário
-- (data comemorativa ou seg/qua/sex). Serve para:
--  - não fazer a mesma vaga duas vezes (e não recriar um post que a equipe APAGOU = descartou);
--  - variar: ver quais temas, tratores e cenas saíram por último;
--  - saber quanto custou.
-- Rodar no projeto do portal (citrhumdkfivdzbmayde). Pode rodar de novo sem estragar nada.
-- =============================================================================
create table if not exists mkt_robo (
  chave       text primary key,                 -- ex.: "data:2026-12-05:Dia Mundial do Solo" ou "dia:2026-12-07"
  dia         date not null,
  tipo        text not null check (tipo in ('data', 'dia')),
  tema        text,                             -- assunto do post (para não repetir)
  post_id     uuid,                             -- post criado em site_posts
  foto_id     uuid,                             -- foto do banco usada como base da cena
  cena        text,                             -- descrição da cena pedida à IA de imagem
  status      text not null default 'feito' check (status in ('feito', 'erro')),
  erro        text,
  custo_usd   numeric(8,4),
  criado_em   timestamptz not null default now()
);
create index if not exists mkt_robo_dia on mkt_robo (dia desc);
alter table mkt_robo enable row level security;

-- Todo dia às 07:00 o robô olha os próximos 30 dias e preenche até 3 vagas (src/lib/marketing/robo/robo.ts).
insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, hora, prioridade, usa_omie, duracao_max_min, ativo) values
  ('marketing-robo-posts', 'marketing-robo-posts', 'Marketing — robô de posts', 'Marketing',
   'Preenche o calendário de conteúdo 30 dias à frente (datas comemorativas + seg/qua/sex): texto pelo Claude, cena com o trator real pela OpenAI e a arte pronta. Os posts nascem como "ideia" para a equipe aprovar.',
   'diario', '07:00', 'rapido', false, 15, true)
on conflict (chave) do nothing;

-- Conferir: deve mostrar 1 linha.
select chave, hora, ativo from agendamentos where chave = 'marketing-robo-posts';
