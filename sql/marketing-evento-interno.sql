-- =====================================================================
-- MARKETING — tipo "Evento interno" + grupo de requisições ligado a um evento (José, 23/11/2026)
-- Evento interno = confraternização, festa de fim de ano, aniversário, almoço da equipe, treinamento interno.
-- Convidados usam a coluna que já existe publico_total_evento (o formulário mostra como "Convidados").
-- Só acrescenta; não apaga nada. Pode rodar mais de uma vez.
-- Rodar no Supabase: SQL Editor → colar tudo → Run.
-- =====================================================================

-- 1) novo tipo (mesma lista de sql/marketing-campanhas-unificar.sql + 'evento_interno')
alter table mkt_acoes drop constraint if exists mkt_acoes_tipo_check;
alter table mkt_acoes add constraint mkt_acoes_tipo_check
  check (tipo in ('campanha','feira','dia_de_campo','acao_loja','patrocinio','midia','brinde','evento_interno','outro'));

-- 2) grupo de requisições → evento/campanha (um evento pode ter vários grupos)
alter table requisicao_grupos add column if not exists mkt_acao_id uuid references mkt_acoes(id) on delete set null;
create index if not exists ix_requisicao_grupos_mkt_acao on requisicao_grupos (mkt_acao_id);

-- 3) a Confraternização 2026 (criada como "Outro") passa a ser evento interno
update mkt_acoes set tipo = 'evento_interno' where tipo = 'outro' and nome ilike 'confraterniza%';

-- Desfazer (se precisar):
-- update mkt_acoes set tipo = 'outro' where tipo = 'evento_interno';
-- alter table requisicao_grupos drop column if exists mkt_acao_id;
-- (e recriar o check sem 'evento_interno')
