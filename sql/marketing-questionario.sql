-- =============================================================================
-- QUESTIONÁRIO PÓS-EVENTO POR LINK ÚNICO
--
-- Um link (`/q/<token>`) que uma pessoa abre no celular, SEM LOGIN, responde
-- aos poucos e volta depois. Nasceu do IRRIGASHOW 2026: quem organizou saiu da
-- empresa, e a memória do evento está com o Dougras — que não usa o módulo.
--
-- PRINCÍPIOS DESTE ARQUIVO
--  * Idempotente: pode rodar inteiro de novo sem estragar nada.
--  * RLS ON com ZERO policy, igual ao resto do módulo. O respondente NÃO fala
--    com o banco: fala com /api/q/<token>, que valida o token no servidor e usa
--    service role. A anon key não lê nem escreve nada aqui.
--  * O TOKEN é gerado no Node (crypto.randomBytes(32).toString('base64url')),
--    não no Postgres: `encode(...,'base64url')` só existe no PG 18, e toda
--    escrita do módulo já passa por rota de API.
--  * Nome do destinatário é SNAPSHOT sem FK — a pessoa pode sair da empresa e
--    o questionário respondido continua legível (mesma regra do mkt_acoes).
--
-- Depende de sql/marketing-acoes.sql (já aplicada).
-- APLICAR À MÃO no SQL Editor do Supabase, ANTES do deploy do código.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 0 — PRÉ-CHECKS (rode isolado, só leitura, e LEIA a saída)
-- ─────────────────────────────────────────────────────────────────────────────
-- 0.1 A migration do módulo já está aplicada?
--   SELECT to_regclass('public.mkt_acoes'), to_regclass('public.mkt_avaliacoes');
--   -- esperado: as duas NÃO nulas
--
-- 0.2 Nenhuma tabela de questionário já existe?
--   SELECT table_name FROM information_schema.tables
--    WHERE table_schema='public' AND table_name LIKE 'mkt|_questionario%' ESCAPE '|';
--   -- esperado: 0 linhas na primeira execução
--
-- 0.3 Quais colunas de destino da importação já existem?
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='mkt_acoes'
--      AND column_name IN ('dias_participacao','publico_total_evento','stand_descricao');
--   -- esperado: 0 linhas (a SEÇÃO 3 cria as três)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgcrypto;


-- =============================================================================
-- SEÇÃO 1 — LINKS DE PREENCHIMENTO
-- Um link por pessoa por ação. O token é a credencial: quem tem o link
-- responde, e é só isso que ele permite fazer.
-- =============================================================================
create table if not exists mkt_questionario_links (
  id                      uuid primary key default gen_random_uuid(),
  acao_id                 uuid not null references mkt_acoes(id) on delete cascade,

  -- 32 bytes em base64url (43 caracteres), gerado no servidor. Não é
  -- enumerável, e é o único segredo envolvido.
  token                   text not null unique,

  -- Destinatário: id SEM FK + NOME sempre gravado (ver princípio do cabeçalho).
  destinatario_usuario_id uuid,
  destinatario_nome       text,
  destinatario_email      text,

  -- editavel=false trava as respostas. O "Enviar" do respondente NÃO trava:
  -- quem fecha é um admin, de propósito — ele pode lembrar de algo depois.
  editavel                boolean not null default true,
  expira_em               timestamptz,          -- null = sem expiração

  titulo                  text,                 -- rótulo livre ("Pós-evento")
  observacao              text,

  criado_por_id           uuid,
  criado_por_nome         text,
  criado_em               timestamptz not null default now(),

  -- Telemetria mínima do preenchimento, pra saber se a pessoa abriu e parou.
  primeiro_acesso_em      timestamptz,
  ultimo_salvamento_em    timestamptz,
  enviado_em              timestamptz
);

create index if not exists ix_mkt_quest_links_acao  on mkt_questionario_links (acao_id);
create index if not exists ix_mkt_quest_links_dest  on mkt_questionario_links (destinatario_usuario_id);

comment on table mkt_questionario_links is
  'Link único (/q/<token>) do questionário pós-evento. Sem login: o token é a credencial e só serve pra responder ESTE questionário.';
comment on column mkt_questionario_links.token is
  'crypto.randomBytes(32).toString(''base64url'') gerado no Node. NÃO gerar no Postgres: encode(...,''base64url'') só existe no PG 18.';
comment on column mkt_questionario_links.editavel is
  'false = respostas travadas. O "Enviar" do respondente não trava — quem fecha é admin, pra pessoa poder complementar depois.';
comment on column mkt_questionario_links.destinatario_nome is
  'SNAPSHOT. Sem FK de propósito: a pessoa pode sair da empresa e o questionário continua legível.';


-- =============================================================================
-- SEÇÃO 2 — RESPOSTAS
-- Uma linha por link. As respostas ficam num JSONB chaveado por qNN (q01..q26)
-- porque o texto das perguntas muda com o tempo e não vale uma coluna por
-- pergunta. O catálogo das perguntas vive no CÓDIGO
-- (src/lib/marketing/questionario.ts), que é onde dá pra versionar e testar.
-- =============================================================================
create table if not exists mkt_questionario_respostas (
  link_id       uuid primary key references mkt_questionario_links(id) on delete cascade,
  respostas     jsonb not null default '{}'::jsonb,   -- { "q01": "...", ... }
  atualizado_em timestamptz not null default now()
);

comment on column mkt_questionario_respostas.respostas is
  'Chaveado por qNN. A rota faz MERGE (respostas || novas), nunca substitui o objeto inteiro: dois aparelhos abertos no mesmo link não apagam o campo um do outro.';


-- =============================================================================
-- SEÇÃO 3 — COLUNAS DE DESTINO DA IMPORTAÇÃO
-- O questionário pergunta coisas que a ficha da ação ainda não tinha onde
-- guardar. Sem estas colunas, "Importar para a ficha" jogaria tudo em
-- observacoes e a informação continuaria solta.
-- =============================================================================
alter table mkt_acoes add column if not exists dias_participacao    integer;
alter table mkt_acoes add column if not exists publico_total_evento integer;
alter table mkt_acoes add column if not exists stand_descricao      text;

comment on column mkt_acoes.publico_total_evento is
  'Público do EVENTO INTEIRO, divulgado pelo organizador. Não confundir com publico_estimado, que é quem passou no NOSSO stand.';

alter table mkt_avaliacoes add column if not exists perfil_publico          text;
alter table mkt_avaliacoes add column if not exists produtos_mais_interesse text;
alter table mkt_avaliacoes add column if not exists percepcao_marca         text;
alter table mkt_avaliacoes add column if not exists justificativa           text;

comment on column mkt_avaliacoes.justificativa is
  'Resposta em texto de "vale participar de novo, e por quê". O campo `repetir` (enum) continua sendo escolha humana — a importação não adivinha.';


-- =============================================================================
-- SEÇÃO 4 — RLS: TUDO FECHADO PRO NAVEGADOR
-- Vale também (e principalmente) pro respondente: ele nunca toca no banco.
-- =============================================================================
alter table mkt_questionario_links     enable row level security;
alter table mkt_questionario_respostas enable row level security;
-- Sem NENHUMA policy: anon/authenticated não leem nem escrevem.
-- Um SELECT com a anon key aqui devolve [] SEM ERRO — se a tela vier vazia,
-- é porque alguém tentou ler direto em vez de passar pela rota.

commit;

notify pgrst, 'reload schema';


-- =============================================================================
-- SEÇÃO 5 — VERIFICAÇÃO PÓS-MIGRATION
-- =============================================================================
-- 5.1 As duas tabelas existem, com RLS e sem policy?
--   SELECT c.relname, c.relrowsecurity,
--          (SELECT count(*) FROM pg_policies p
--            WHERE p.schemaname='public' AND p.tablename=c.relname) AS policies
--     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--    WHERE n.nspname='public' AND c.relname LIKE 'mkt|_questionario%' ESCAPE '|'
--    ORDER BY 1;
--   -- esperado: relrowsecurity = t e policies = 0 nas duas
--
-- 5.2 As colunas de destino entraram?
--   SELECT table_name, column_name FROM information_schema.columns
--    WHERE (table_name='mkt_acoes'
--             AND column_name IN ('dias_participacao','publico_total_evento','stand_descricao'))
--       OR (table_name='mkt_avaliacoes'
--             AND column_name IN ('perfil_publico','produtos_mais_interesse','percepcao_marca','justificativa'))
--    ORDER BY 1,2;
--   -- esperado: 7 linhas
--
-- 5.3 SMOKE TEST (roda e desfaz — cole o bloco inteiro):
--   BEGIN;
--     INSERT INTO mkt_acoes (nome, tipo) VALUES ('SMOKE QUESTIONARIO','feira');
--
--     INSERT INTO mkt_questionario_links (acao_id, token, destinatario_nome)
--     SELECT id, 'token-de-teste-nao-usar', 'Fulano'
--       FROM mkt_acoes WHERE nome='SMOKE QUESTIONARIO';
--
--     INSERT INTO mkt_questionario_respostas (link_id, respostas)
--     SELECT id, '{"q01":"primeira resposta"}'::jsonb
--       FROM mkt_questionario_links WHERE token='token-de-teste-nao-usar';
--
--     -- o MERGE preserva o que já estava e acrescenta o novo
--     UPDATE mkt_questionario_respostas
--        SET respostas = respostas || '{"q02":"segunda"}'::jsonb
--      WHERE link_id = (SELECT id FROM mkt_questionario_links WHERE token='token-de-teste-nao-usar');
--
--     SELECT respostas FROM mkt_questionario_respostas
--      WHERE link_id = (SELECT id FROM mkt_questionario_links WHERE token='token-de-teste-nao-usar');
--     -- esperado: {"q01": "primeira resposta", "q02": "segunda"}
--
--     -- token duplicado DEVE falhar (unique)
--     -- INSERT INTO mkt_questionario_links (acao_id, token)
--     -- SELECT id, 'token-de-teste-nao-usar' FROM mkt_acoes WHERE nome='SMOKE QUESTIONARIO';
--   ROLLBACK;
-- =============================================================================
