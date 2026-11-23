-- =====================================================================
-- MARKETING — Fase 2 do plano (dados confiáveis), 23/11/2026
-- Só ACRESCENTA (colunas, tabela, robô). NÃO muda nenhum dado existente — a reclassificação dos custos
-- do IRRIGASHOW está à parte em sql/marketing-fase2-reclassificar.sql (rodar só depois de aprovar a lista).
-- Pode rodar mais de uma vez. Rodar no Supabase: SQL Editor → colar tudo → Run.
-- =====================================================================

-- 2.2) categoria adivinhada pelo portal, até alguém confirmar
alter table mkt_custos add column if not exists categoria_sugerida boolean not null default false;

-- 2.3 / 2.4) regras do Retorno (margem padrão por tipo de máquina, janela de atribuição por tipo de ação)
create table if not exists mkt_parametros (
  chave          text primary key,
  valor          jsonb not null default '{}'::jsonb,
  atualizado_em  timestamptz not null default now(),
  atualizado_por text
);
alter table mkt_parametros enable row level security;   -- mesmo padrão das mkt_*: sem policy, só a API (service role)
revoke all on mkt_parametros from anon, authenticated;

-- 2.5) marcador do aviso "promoção acaba em 3 dias" (um aviso por promoção)
alter table site_promocoes add column if not exists aviso_fim_em timestamptz;

-- 2.6) marcador do aviso "campanha parada há 7 dias" (no máximo um por semana)
alter table mkt_acoes add column if not exists alerta_parada_em timestamptz;

-- robô diário do Marketing (src/lib/marketing/diario.ts), 07:30 todo dia
insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, hora, prioridade, usa_omie, duracao_max_min, ativo) values
  ('marketing-diario', 'marketing-diario', 'Marketing — promoções e campanhas', 'Marketing',
   'Desliga promoção vencida, avisa a que acaba em 3 dias e avisa o responsável de campanha em andamento parada há 7 dias.',
   'diario', '07:30', 'rapido', false, 5, true)
on conflict (chave) do nothing;

notify pgrst, 'reload schema';

-- Desfazer (se precisar):
-- delete from agendamentos where chave = 'marketing-diario';
-- alter table mkt_acoes drop column if exists alerta_parada_em;
-- alter table site_promocoes drop column if exists aviso_fim_em;
-- drop table if exists mkt_parametros;
-- alter table mkt_custos drop column if exists categoria_sugerida;
