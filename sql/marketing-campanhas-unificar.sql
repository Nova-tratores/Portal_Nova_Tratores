-- =============================================================================
-- Controle Marketing — Ação vira Campanha (18/11/2026, José)
--
-- "A ação vira campanha, entra da mais antiga para a mais nova e coloca capa em ambas."
--
-- Uma ficha só: mkt_acoes é a CAMPANHA (guarda-chuva com custos, apoio, leads,
-- propostas e — no próximo passo — reuniões e linha do tempo). A roleta (tabela
-- `campanhas`, Black Friday…) vira uma ferramenta DENTRO da campanha: aponta
-- para ela por campanhas.acao_id.
--
-- ADITIVO: só cria colunas e linhas, não apaga nada. Idempotente.
-- Correr no Supabase: SQL Editor -> colar -> Run.
-- =============================================================================

-- 1) Capa da campanha (URL pública da foto, no Storage site-produtos/campanhas/…)
alter table mkt_acoes add column if not exists capa_url text;

-- 2) Novo tipo: 'campanha' (promoção/campanha de vendas, ex.: Black Friday com roleta)
alter table mkt_acoes drop constraint if exists mkt_acoes_tipo_check;
alter table mkt_acoes add constraint mkt_acoes_tipo_check
  check (tipo in ('campanha','feira','dia_de_campo','acao_loja','patrocinio','midia','brinde','outro'));

-- 3) A roleta aponta para a campanha
alter table campanhas add column if not exists acao_id uuid references mkt_acoes(id) on delete set null;
create index if not exists ix_campanhas_acao on campanhas (acao_id);

-- 4) Cada roleta que já existe ganha a sua campanha (com a capa que ela já tinha)
do $$
declare
  c record;
  novo uuid;
begin
  for c in select * from campanhas where acao_id is null loop
    insert into mkt_acoes (nome, tipo, status, data_inicio, data_fim, capa_url, descricao, criado_por_nome)
    values (
      c.nome || ' ' || c.ano,
      'campanha',
      case when current_date > c.fim then 'realizada'
           when current_date >= c.inicio then 'em_andamento'
           else 'aprovada' end,
      c.inicio, c.fim,
      nullif(c.config->>'capa', ''),
      'Campanha com roleta no site (criada automaticamente ao juntar Campanhas e Ações).',
      'Portal'
    )
    returning id into novo;
    update campanhas set acao_id = novo where id = c.id;
  end loop;
end $$;

-- Conferência: toda roleta tem campanha (tem que voltar VAZIO)
-- select id, nome, ano from campanhas where acao_id is null;

-- =============================================================================
-- 5) Reunião ↔ Campanha (linha do tempo)
-- Cada ASSUNTO da pauta pode dizer de qual campanha ele trata — na reunião não:
-- uma reunião discute várias coisas, e só a decisão certa deve ir para a linha
-- do tempo da campanha. Na ficha da campanha a aba "Linha do tempo" junta:
-- reuniões/decisões, tarefas nascidas delas, custos, leads, apoio e a roleta.
-- =============================================================================
alter table public.reunioes_itens add column if not exists campanha_id uuid references mkt_acoes(id) on delete set null;
create index if not exists ix_reunioes_itens_campanha on public.reunioes_itens (campanha_id) where campanha_id is not null;
