-- =====================================================================
-- MARKETING — Fase 4 do plano (etiquetas e código do post), 23/11/2026
-- Só ACRESCENTA colunas em site_posts. Pode rodar mais de uma vez.
-- Rodar no Supabase: SQL Editor → colar tudo → Run.
-- =====================================================================
alter table site_posts add column if not exists etiqueta_tipo text;     -- entrega | oficina | dica | promocao | data | bastidor | depoimento | evento
alter table site_posts add column if not exists gente_real    boolean;  -- tem cliente/técnico/operador de verdade?
alter table site_posts add column if not exists maquina       text;     -- ex.: Mahindra 6075 (opcional)
alter table site_posts add column if not exists gancho        text;     -- pergunta | numero | antes_depois | pessoa | outro
alter table site_posts add column if not exists codigo        text;     -- código curto (ex.: 6075CAB) que vai no WhatsApp e na UTM
alter table site_posts add column if not exists acao_id       uuid references mkt_acoes(id) on delete set null;   -- campanha do post (opcional)
create unique index if not exists site_posts_codigo_uk on site_posts (codigo) where codigo is not null;
create index if not exists site_posts_acao_idx on site_posts (acao_id);
-- formato agora aceita também 'carrossel' (a coluna não tem CHECK; quem valida é a API)

-- 4.3) conversas do NovaZap já lidas pelo robô; codigo preenchido = o cliente chegou pelo post
create table if not exists mkt_conversas_lidas (
  conversa_id       bigint primary key,
  codigo            text,             -- código do post achado na 1ª mensagem do cliente (null = não veio de post)
  contato_nome      text,
  contato_telefone  text,
  primeira_mensagem text,
  conversa_em       timestamptz,
  lida_em           timestamptz not null default now()
);
create index if not exists mkt_conversas_lidas_codigo_idx on mkt_conversas_lidas (codigo) where codigo is not null;
alter table mkt_conversas_lidas enable row level security;   -- só a API (service role)
revoke all on mkt_conversas_lidas from anon, authenticated;

insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, intervalo_min, prioridade, usa_omie, duracao_max_min, ativo) values
  ('marketing-contatos-posts', 'marketing-contatos-posts', 'Marketing — contatos que vieram de post', 'Marketing',
   'Lê as conversas novas do NovaZap e, se a 1ª mensagem do cliente tem o código de um post (ex.: 6075CAB), conta como contato daquele post.',
   'intervalo', 15, 'rapido', false, 5, true)
on conflict (chave) do nothing;

notify pgrst, 'reload schema';

-- Desfazer (se precisar):
-- drop index if exists site_posts_codigo_uk; drop index if exists site_posts_acao_idx;
-- alter table site_posts drop column if exists acao_id, drop column if exists codigo, drop column if exists gancho,
--   drop column if exists maquina, drop column if exists gente_real, drop column if exists etiqueta_tipo;
