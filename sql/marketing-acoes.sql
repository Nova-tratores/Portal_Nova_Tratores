-- =============================================================================
-- MARKETING & EVENTOS — ações, apoio de fábrica, custos híbridos, leads,
-- equipe, itens expostos, ações realizadas/contrapartidas, concorrentes,
-- mídia, avaliação pós-evento e o vínculo com propostas.
--
-- A "AÇÃO DE MARKETING" é a entidade guarda-chuva: FEIRA É UM TIPO, não a
-- entidade. Cobre também gasto de marketing que não é evento (mídia paga,
-- brinde, patrocínio).
--
-- Caso que originou o módulo: IRRIGASHOW 2026 — apoio de R$ 20.000 da Mahindra,
-- relatório de contrapartida pendente, responsável saiu da empresa.
--
-- PRINCÍPIOS DESTE ARQUIVO
--  * Idempotente: pode rodar inteiro de novo sem estragar nada.
--  * RLS ON com ZERO policy: o navegador NÃO lê nem escreve com a anon key.
--    Todo acesso passa por /api/marketing/* (service role) com autenticar().
--    ATENÇÃO: com RLS assim, um supabase.from('mkt_*').select() no client
--    devolve [] SEM ERRO. Se a tela vier vazia, é isso.
--  * NENHUMA alteração em tabela existente. Em especial NADA em "Formulario":
--    a v_formulario é `SELECT f.*` e o Postgres expande o * na criação — coluna
--    nova não apareceria na view, que é o que a tela /propostas lê.
--    (ver sql/propostas-tags.sql, linhas 8-13)
--  * Sem trigger: quem grava `atualizado_em` é a rota de API (menos mágica
--    escondida — mesmo padrão de frota_pendencias).
--  * Snapshot de nome em toda referência a pessoa: o responsável pode sair da
--    empresa e o histórico tem que continuar legível.
--
-- APLICAR À MÃO no SQL Editor do Supabase, ANTES do deploy do código.
-- (O código degrada se a migration faltar, mas o módulo fica só com o aviso.)
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 0 — PRÉ-CHECKS (rode isolado, só leitura, e LEIA a saída)
-- ─────────────────────────────────────────────────────────────────────────────
-- 0.1 "Formulario".id é bigint? (a FK de mkt_acao_propostas depende disso)
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'Formulario' AND column_name = 'id';
--   -- esperado: id | bigint
--
-- 0.2 Nenhuma tabela mkt_* já existe? (nome livre)
--   SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public' AND table_name LIKE 'mkt|_%' ESCAPE '|';
--   -- esperado: 0 linhas na primeira execução
--
-- 0.3 A tabela de envios de e-mail existe? (a SEÇÃO 13 semeia nela)
--   SELECT to_regclass('public.email_envios_config');
--   -- se vier NULL, rode sql/email-envios-config.sql antes — ou pule a SEÇÃO 13
--
-- 0.4 Postgres >= 12 (colunas GENERATED ... STORED)
--   SHOW server_version;
-- ─────────────────────────────────────────────────────────────────────────────


begin;

create extension if not exists pgcrypto;


-- =============================================================================
-- SEÇÃO 1 — AÇÃO DE MARKETING (entidade central, guarda-chuva)
-- =============================================================================
create table if not exists mkt_acoes (
  id                 uuid primary key default gen_random_uuid(),
  codigo             text,                       -- apelido curto: 'IRRIGASHOW26'
  nome               text not null,
  tipo               text not null default 'outro'
                     check (tipo in ('feira','dia_de_campo','acao_loja','patrocinio','midia','brinde','outro')),
  status             text not null default 'planejada'
                     check (status in ('planejada','aprovada','em_andamento','realizada','cancelada')),
  empresa            text not null default 'NOVA' check (empresa in ('NOVA','CASTRO')),
  descricao          text,
  objetivo           text,

  -- Período. Ação SEM data é válida (ex.: "Brindes 2026") — ambas nullable.
  data_inicio        date,
  data_fim           date,
  local_nome         text,
  cidade             text,
  uf                 text,

  -- CENTRO DE CUSTO: o Projeto do Omie — eixo que JÁ existe no portal
  -- (Requisicao.projeto_codigo, finan_pagar.omie_projeto,
  --  portal_nt_projetos_PRINCIPAL). É o que faz o custo achar a ação sozinho.
  projeto_codigo     bigint,
  projeto_nome       text,
  projeto_empresa    text,

  orcamento_previsto numeric(14,2),
  meta_leads         integer,
  meta_vendas        integer,
  meta_receita       numeric(14,2),

  -- Responsável: id SEM FK + NOME sempre gravado. Ver princípio do cabeçalho.
  responsavel_id     uuid,
  responsavel_nome   text,
  responsavel_email  text,

  publico_estimado   integer,
  observacoes        text,

  criado_por_id      uuid,
  criado_por_nome    text,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  deleted_at         timestamptz,                -- lixeira (padrão do repo)

  constraint mkt_acoes_periodo_ck
    check (data_fim is null or data_inicio is null or data_fim >= data_inicio)
);

create index if not exists ix_mkt_acoes_status  on mkt_acoes (status) where deleted_at is null;
create index if not exists ix_mkt_acoes_tipo    on mkt_acoes (tipo)   where deleted_at is null;
create index if not exists ix_mkt_acoes_periodo on mkt_acoes (data_inicio, data_fim);
create index if not exists ix_mkt_acoes_projeto on mkt_acoes (projeto_codigo, projeto_empresa);
create index if not exists ix_mkt_acoes_resp    on mkt_acoes (responsavel_id);

comment on table  mkt_acoes is
  'Ação de marketing (guarda-chuva). Feira é um TIPO, não a entidade. Cobre também gasto de marketing que não é evento.';
comment on column mkt_acoes.projeto_codigo is
  'Projeto do Omie (portal_nt_projetos_PRINCIPAL.codigo). Ponte pros custos: Requisicao.projeto_codigo e finan_pagar.omie_projeto.';
comment on column mkt_acoes.responsavel_nome is
  'SNAPSHOT. Sem FK de propósito: o responsável pode sair da empresa e a ação continua legível.';


-- =============================================================================
-- SEÇÃO 2 — APOIO DE FÁBRICA / VERBA CO-OP  (o item de MAIOR VALOR do módulo)
-- Tabela própria, não colunas em mkt_acoes: N apoiadores por ação, cada um com
-- valor, prazo, processo documental (NF/ND/OC) e contrapartida próprios, e uma
-- máquina de estados que anda em ritmo diferente do da ação.
-- =============================================================================
create table if not exists mkt_apoios (
  id                    uuid primary key default gen_random_uuid(),
  acao_id               uuid not null references mkt_acoes(id) on delete cascade,
  apoiador              text not null default 'Mahindra',
  tipo                  text not null default 'verba'
                        check (tipo in ('verba','produto','material','servico','outro')),
  descricao             text,

  valor_previsto        numeric(14,2),   -- o que foi pedido
  valor_aprovado        numeric(14,2),   -- o que a fábrica aprovou
  valor_recebido        numeric(14,2),   -- o que efetivamente entrou

  status                text not null default 'pleiteado'
                        check (status in ('pleiteado','aprovado','documentado','faturado','recebido','recusado','cancelado')),

  -- PROCESSO DOCUMENTAL: é o que trava o dinheiro na prática.
  processo_numero       text,            -- protocolo/co-op na fábrica
  documento_tipo        text check (documento_tipo in ('NF','ND','OC','outro')),
  documento_numero      text,
  documento_emitido_em  date,
  documento_url         text,            -- bucket público 'anexos'
  previsao_credito      date,
  credito_em            date,
  forma_credito         text,            -- 'desconto em duplicata' | 'depósito' | ...

  -- CONTRAPARTIDA: a obrigação que sobra depois que o dinheiro entra.
  contrapartida_texto   text,
  contrapartida_prazo   date,
  relatorio_status      text not null default 'pendente'
                        check (relatorio_status in ('pendente','em_elaboracao','enviado','aceito','recusado')),
  relatorio_enviado_em     timestamptz,
  relatorio_enviado_para   text[] not null default '{}',
  relatorio_url            text,         -- PDF arquivado

  responsavel_id        uuid,
  responsavel_nome      text,            -- SNAPSHOT (mesma regra da ação)
  observacoes           text,
  criado_por_id         uuid,
  criado_por_nome       text,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

create index if not exists ix_mkt_apoios_acao   on mkt_apoios (acao_id);
create index if not exists ix_mkt_apoios_status on mkt_apoios (status);
create index if not exists ix_mkt_apoios_prazo  on mkt_apoios (contrapartida_prazo)
  where relatorio_status in ('pendente','em_elaboracao');

comment on table mkt_apoios is
  'Apoio/verba co-op de fábrica por ação. Máquina de estados própria + processo NF/ND/OC + contrapartida com prazo. Não existe equivalente disso em nenhum outro módulo do portal.';


-- =============================================================================
-- SEÇÃO 3 — CUSTOS HÍBRIDOS (digitado à mão OU apontando pra um documento)
-- Idioma genérico vinculo_tipo/vinculo_ref, igual sql/opa-vinculo-veiculo.sql e
-- portal_doc_vinculos. SEM FK: os ids das origens são heterogêneos
-- ("Requisicao".id é bigint, finan_pagar e notas_entrada têm PKs diferentes) e
-- FK polimórfica não existe em Postgres.
-- =============================================================================
create table if not exists mkt_custos (
  id              uuid primary key default gen_random_uuid(),
  acao_id         uuid not null references mkt_acoes(id) on delete cascade,
  descricao       text not null,
  categoria       text not null default 'outro'
                  check (categoria in ('estande','locacao','montagem','transporte','hospedagem',
                                       'alimentacao','pessoal','brinde','impresso','midia',
                                       'patrocinio','frete','combustivel','outro')),
  fornecedor      text,
  data            date,

  vinculo_tipo    text check (vinculo_tipo in ('requisicao','finan_pagar','nota_entrada')),
  vinculo_ref     text,      -- id/nº do documento de origem, como TEXTO
  vinculo_label   text,      -- rótulo humano no momento do vínculo (snapshot)

  -- Um estado só, impossível de ficar inconsistente, e continua filtrável.
  origem          text generated always as (coalesce(vinculo_tipo, 'manual')) stored,

  -- valor AUTORITÁRIO (é o que o ROI soma). Snapshot de propósito: o ROI de uma
  -- ação encerrada tem que ser reproduzível mesmo que o documento de origem
  -- mude depois.
  valor           numeric(14,2) not null default 0,
  valor_fonte     numeric(14,2),   -- último valor lido da origem (comparativo)
  sincronizado_em timestamptz,     -- quando foi lido (badge de divergência)

  rateio_percent  numeric(6,3) not null default 100
                  check (rateio_percent > 0 and rateio_percent <= 100),
  status          text not null default 'confirmado'
                  check (status in ('previsto','confirmado','cancelado')),
  observacoes     text,
  anexo_url       text,
  criado_por_id   uuid,
  criado_por_nome text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  -- ou os dois são nulos (custo manual) ou os dois estão preenchidos
  constraint mkt_custos_vinculo_ck check ((vinculo_tipo is null) = (vinculo_ref is null))
);

create index if not exists ix_mkt_custos_acao on mkt_custos (acao_id, status);
create index if not exists ix_mkt_custos_vinc on mkt_custos (vinculo_tipo, vinculo_ref);
-- o mesmo documento não entra duas vezes na mesma ação
create unique index if not exists ux_mkt_custos_doc
  on mkt_custos (acao_id, vinculo_tipo, vinculo_ref) where vinculo_ref is not null;

comment on column mkt_custos.valor is
  'Valor autoritário do custo (SNAPSHOT). NUNCA recalcular na leitura: o ROI de ação encerrada precisa ser reproduzível.';
comment on column mkt_custos.valor_fonte is
  'Último valor lido da origem. "Requisicao".valor_despeza é TEXT em formato BR/US misto — ler SEMPRE com parseValorBR (lib/requisicoes/autorizacao.ts), nunca somar em SQL. Diferente de `valor` = badge de divergência na tela.';


-- =============================================================================
-- SEÇÃO 4 — LEADS (texto livre; vínculo a cliente é OPCIONAL)
-- Numa feira a maioria dos visitantes NÃO é cliente cadastrado — por isso o
-- lead nasce como texto e o vínculo ao cadastro é enfeite, não requisito.
-- =============================================================================
create table if not exists mkt_leads (
  id                 uuid primary key default gen_random_uuid(),
  acao_id            uuid not null references mkt_acoes(id) on delete cascade,

  -- O LEAD É ISTO. Único campo obrigatório além da ação.
  texto              text not null,

  nome               text,
  telefone           text,
  telefone_norm      text generated always as
                     (nullif(regexp_replace(coalesce(telefone,''), '[^0-9]', '', 'g'), '')) stored,
  cidade             text,
  interesse          text,
  foto_url           text,          -- bucket público 'anexos', prefixo marketing/leads/

  -- Vínculo OPCIONAL ao cadastro Omie. SEM FK, e o par é a chave:
  -- portal_nt_clientes_cadastro_omie é espelho de sincronismo (um re-import
  -- quebraria a FK no meio da feira) e cod_cli NÃO é único entre NOVA e CASTRO.
  cliente_cod_cli    integer,
  cliente_empresa    text check (cliente_empresa in ('NOVA','CASTRO')),
  cliente_nome       text,          -- snapshot

  qualificacao       text not null default 'novo'
                     check (qualificacao in ('novo','em_contato','qualificado','proposta','ganho','perdido','descartado')),
  temperatura        text check (temperatura in ('quente','morno','frio')),
  responsavel_nome   text,
  proximo_contato    date,
  observacoes        text,

  capturado_em       timestamptz not null default now(),
  capturado_por_id   uuid,
  capturado_por_nome text,
  atualizado_em      timestamptz not null default now(),

  constraint mkt_leads_cliente_ck check (cliente_cod_cli is null or cliente_empresa is not null)
);

create index if not exists ix_mkt_leads_acao on mkt_leads (acao_id, qualificacao);
create index if not exists ix_mkt_leads_tel  on mkt_leads (telefone_norm) where telefone_norm is not null;
create index if not exists ix_mkt_leads_cli  on mkt_leads (cliente_cod_cli, cliente_empresa);

comment on column mkt_leads.texto is
  'Captura em TEXTO LIVRE — é o campo principal. Todo o resto é opcional: a tela mobile não pode atrapalhar quem está de pé no estande.';
comment on column mkt_leads.telefone_norm is
  'Só dígitos, GERADA. Base do aviso de possível duplicado (3 vendedores anotam o mesmo visitante). AVISO, nunca bloqueio.';


-- =============================================================================
-- SEÇÃO 5 — VÍNCULO PROPOSTA <-> AÇÃO (tabela de ligação)
-- NUNCA coluna em "Formulario": v_formulario é `SELECT f.*` e não enxergaria a
-- coluna nova sem recriar a view (sql/propostas-tags.sql, linhas 8-13). Além
-- disso a relação é N:N e tem metadados próprios.
-- =============================================================================
create table if not exists mkt_acao_propostas (
  id              bigserial primary key,
  acao_id         uuid   not null references mkt_acoes(id)    on delete cascade,
  proposta_id     bigint not null references "Formulario"(id) on delete cascade,
  lead_id         uuid references mkt_leads(id) on delete set null,
  origem          text not null default 'manual'
                  check (origem in ('manual','lead','automatico')),
  peso            numeric(5,4) not null default 1
                  check (peso > 0 and peso <= 1),   -- atribuição parcial da receita
  observacao      text,
  criado_por_id   uuid,
  criado_por_nome text,
  criado_em       timestamptz not null default now()
);

create unique index if not exists ux_mkt_acao_prop      on mkt_acao_propostas (acao_id, proposta_id);
create index        if not exists ix_mkt_acao_prop_prop on mkt_acao_propostas (proposta_id);

comment on table mkt_acao_propostas is
  'Liga proposta ("Formulario") a uma ação de marketing. Tabela de ligação de propósito: nada é escrito no módulo Comercial.';


-- =============================================================================
-- SEÇÃO 6 — EQUIPE DA AÇÃO
-- =============================================================================
create table if not exists mkt_equipe (
  id             uuid primary key default gen_random_uuid(),
  acao_id        uuid not null references mkt_acoes(id) on delete cascade,
  usuario_id     uuid,             -- financeiro_usu.id / auth.users.id (sem FK)
  nome           text not null,    -- SNAPSHOT: sobrevive à saída da pessoa
  papel          text not null default 'apoio'
                 check (papel in ('responsavel','apoio','vendedor','tecnico','marketing','externo')),
  telefone       text,
  dias           numeric(6,2),
  horas          numeric(8,2),
  custo_estimado numeric(14,2),
  observacoes    text,
  criado_em      timestamptz not null default now()
);

create index if not exists ix_mkt_equipe_acao on mkt_equipe (acao_id);
create index if not exists ix_mkt_equipe_usu  on mkt_equipe (usuario_id);

comment on column mkt_equipe.custo_estimado is
  'INFORMATIVO. NÃO entra no custo total da ação (senão dobra com a folha). Pra contar, lance um mkt_custos categoria=pessoal explícito.';


-- =============================================================================
-- SEÇÃO 7 — ITENS EXPOSTOS
-- =============================================================================
create table if not exists mkt_itens (
  id             uuid primary key default gen_random_uuid(),
  acao_id        uuid not null references mkt_acoes(id) on delete cascade,
  tipo           text not null default 'trator'
                 check (tipo in ('trator','implemento','peca','autopropelido','servico','outro')),
  modelo         text,
  descricao      text,
  chassi         text,
  codigo_produto text,
  quantidade     numeric(10,2) not null default 1,
  valor_unitario numeric(14,2),
  destino        text not null default 'exposicao'
                 check (destino in ('exposicao','demonstracao','venda','brinde','consumo')),
  vendido        boolean not null default false,
  proposta_id    bigint references "Formulario"(id) on delete set null,
  foto_url       text,
  observacoes    text,
  criado_em      timestamptz not null default now()
);

create index if not exists ix_mkt_itens_acao   on mkt_itens (acao_id);
create index if not exists ix_mkt_itens_chassi on mkt_itens (chassi) where chassi is not null;


-- =============================================================================
-- SEÇÃO 8 — AÇÕES REALIZADAS (planejado x realizado) E CONTRAPARTIDAS
-- Com apoio_id preenchido a linha É uma contrapartida daquele apoiador e entra
-- na seção 3 do PDF do relatório. Uma tabela pros dois usos, de propósito:
-- uma contrapartida É uma atividade que tem dono.
-- =============================================================================
create table if not exists mkt_realizadas (
  id               uuid primary key default gen_random_uuid(),
  acao_id          uuid not null references mkt_acoes(id)  on delete cascade,
  apoio_id         uuid references mkt_apoios(id) on delete set null,
  titulo           text not null,
  descricao        text,
  tipo             text not null default 'atividade'
                   check (tipo in ('atividade','contrapartida','divulgacao','brinde','palestra','demonstracao','outro')),
  planejado        boolean not null default true,
  realizado        boolean not null default false,
  data             date,
  responsavel_nome text,
  evidencia_url    text,
  observacoes      text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

create index if not exists ix_mkt_realizadas_acao  on mkt_realizadas (acao_id);
create index if not exists ix_mkt_realizadas_apoio on mkt_realizadas (apoio_id) where apoio_id is not null;


-- =============================================================================
-- SEÇÃO 9 — CONCORRENTES OBSERVADOS
-- =============================================================================
create table if not exists mkt_concorrentes (
  id                  uuid primary key default gen_random_uuid(),
  acao_id             uuid not null references mkt_acoes(id) on delete cascade,
  marca               text not null,
  representante       text,
  o_que_expos         text,
  preco_praticado     text,   -- TEXTO de propósito: chega como "a partir de 380 mil em 60x"
  condicao            text,
  destaque            text,
  ameaca              text check (ameaca in ('baixa','media','alta')),
  observacoes         text,
  foto_url            text,
  registrado_por_nome text,
  criado_em           timestamptz not null default now()
);

create index if not exists ix_mkt_concorrentes_acao on mkt_concorrentes (acao_id);


-- =============================================================================
-- SEÇÃO 10 — MÍDIA / REGISTRO (evidência da contrapartida)
-- =============================================================================
create table if not exists mkt_midias (
  id              uuid primary key default gen_random_uuid(),
  acao_id         uuid not null references mkt_acoes(id)  on delete cascade,
  apoio_id        uuid references mkt_apoios(id) on delete set null,
  tipo            text not null default 'foto'
                  check (tipo in ('foto','video','post','clipping','banner','documento','outro')),
  url             text not null,   -- public URL do bucket 'anexos'
  legenda         text,
  veiculo         text,            -- Instagram, rádio, jornal...
  alcance         integer,
  data            date,
  contrapartida   boolean not null default false,  -- entra no PDF pra fábrica
  ordem           integer not null default 0,
  criado_por_nome text,
  criado_em       timestamptz not null default now()
);

create index if not exists ix_mkt_midias_acao on mkt_midias (acao_id, ordem);
create index if not exists ix_mkt_midias_cp   on mkt_midias (acao_id) where contrapartida;

comment on table mkt_midias is
  'ATENÇÃO: o bucket `anexos` é PÚBLICO — qualquer um com o link abre. Registro de feira, sim. Documento com CPF ou contrato, NÃO.';


-- =============================================================================
-- SEÇÃO 11 — AVALIAÇÃO PÓS-EVENTO (N avaliadores por ação)
-- Tabela e não colunas em mkt_acoes: mais de uma pessoa avalia (vendedor,
-- marketing, diretoria) e a avaliação sobrevive à saída do responsável —
-- que é exatamente o caso IRRIGASHOW.
-- =============================================================================
create table if not exists mkt_avaliacoes (
  id             uuid primary key default gen_random_uuid(),
  acao_id        uuid not null references mkt_acoes(id) on delete cascade,
  avaliador_id   uuid,
  avaliador_nome text not null,
  nota_geral     smallint check (nota_geral     between 1 and 5),
  nota_publico   smallint check (nota_publico   between 1 and 5),
  nota_estrutura smallint check (nota_estrutura between 1 and 5),
  nota_equipe    smallint check (nota_equipe    between 1 and 5),
  nota_retorno   smallint check (nota_retorno   between 1 and 5),
  funcionou      text,
  nao_funcionou  text,
  aprendizados   text,
  repetir        text check (repetir in ('sim','sim_com_ajustes','nao','indeciso')),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create unique index if not exists ux_mkt_aval
  on mkt_avaliacoes (acao_id, (coalesce(avaliador_id::text, avaliador_nome)));


-- =============================================================================
-- SEÇÃO 12 — RLS: TUDO FECHADO PRO NAVEGADOR (só service role, via /api)
-- =============================================================================
alter table mkt_acoes          enable row level security;
alter table mkt_apoios         enable row level security;
alter table mkt_custos         enable row level security;
alter table mkt_leads          enable row level security;
alter table mkt_acao_propostas enable row level security;
alter table mkt_equipe         enable row level security;
alter table mkt_itens          enable row level security;
alter table mkt_realizadas     enable row level security;
alter table mkt_concorrentes   enable row level security;
alter table mkt_midias         enable row level security;
alter table mkt_avaliacoes     enable row level security;
-- Sem NENHUMA policy = anon/authenticated não leem nem escrevem.
-- Se um dia precisar de leitura direta do browser (Realtime, por ex.), criar a
-- policy explícita AQUI e documentar — não deixar implícito.


-- =============================================================================
-- SEÇÃO 13 — SEED dos envios de e-mail (tela Dev -> /dev/envios-email)
-- Começam DESLIGADOS e sem destinatário. NADA de e-mail em env var do Railway.
-- Pule esta seção se sql/email-envios-config.sql ainda não foi aplicado.
-- =============================================================================
insert into email_envios_config (chave, ativo, parametros) values
  ('marketing_contrapartida',   false, '{}'::jsonb),
  ('marketing_apoios_vencendo', false, '{"dias": 30}'::jsonb)
on conflict (chave) do nothing;


commit;

notify pgrst, 'reload schema';


-- =============================================================================
-- SEÇÃO 14 — VERIFICAÇÃO PÓS-MIGRATION (rode e confira a saída)
-- =============================================================================
-- 14.1 As 11 tabelas existem?
--   SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public' AND table_name LIKE 'mkt|_%' ESCAPE '|'
--    ORDER BY 1;
--   -- esperado (11): mkt_acao_propostas, mkt_acoes, mkt_apoios, mkt_avaliacoes,
--   --                mkt_concorrentes, mkt_custos, mkt_equipe, mkt_itens,
--   --                mkt_leads, mkt_midias, mkt_realizadas
--
-- 14.2 RLS ligado e ZERO policy em todas?
--   SELECT c.relname, c.relrowsecurity,
--          (SELECT count(*) FROM pg_policies p
--            WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
--     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public' AND c.relname LIKE 'mkt|_%' ESCAPE '|'
--    ORDER BY 1;
--   -- esperado: relrowsecurity = t e policies = 0 em TODAS as 11
--
-- 14.3 Os envios foram semeados?
--   SELECT chave, ativo FROM email_envios_config WHERE chave LIKE 'marketing%';
--   -- esperado: 2 linhas, ativo = f
--
-- 14.4 SMOKE TEST (roda e desfaz — cole o bloco inteiro de uma vez):
--   BEGIN;
--     INSERT INTO mkt_acoes (nome, tipo, empresa, data_inicio, data_fim, responsavel_nome)
--     VALUES ('SMOKE TEST', 'feira', 'NOVA', '2026-01-01', '2026-01-03', 'fulano');
--
--     -- custo manual -> origem deve sair 'manual'
--     INSERT INTO mkt_custos (acao_id, descricao, valor)
--     SELECT id, 'estande', 1000 FROM mkt_acoes WHERE nome = 'SMOKE TEST';
--
--     -- custo vinculado -> origem deve sair 'requisicao'
--     INSERT INTO mkt_custos (acao_id, descricao, valor, vinculo_tipo, vinculo_ref)
--     SELECT id, 'frete', 500, 'requisicao', '6423' FROM mkt_acoes WHERE nome = 'SMOKE TEST';
--
--     INSERT INTO mkt_leads (acao_id, texto, telefone)
--     SELECT id, 'quer trator 75cv', '(14) 99863-8071' FROM mkt_acoes WHERE nome = 'SMOKE TEST';
--
--     SELECT origem, valor FROM mkt_custos
--      WHERE acao_id = (SELECT id FROM mkt_acoes WHERE nome = 'SMOKE TEST');
--     -- esperado: manual|1000 e requisicao|500
--
--     SELECT telefone_norm FROM mkt_leads
--      WHERE acao_id = (SELECT id FROM mkt_acoes WHERE nome = 'SMOKE TEST');
--     -- esperado: 14998638071
--   ROLLBACK;
--
-- 14.5 O CHECK de vínculo inconsistente REJEITA? (tem que dar ERRO)
--   BEGIN;
--     INSERT INTO mkt_acoes (nome, tipo) VALUES ('SMOKE CK', 'feira');
--     INSERT INTO mkt_custos (acao_id, descricao, vinculo_tipo)
--     SELECT id, 'sem ref', 'requisicao' FROM mkt_acoes WHERE nome = 'SMOKE CK';
--     -- esperado: ERROR ... violates check constraint "mkt_custos_vinculo_ck"
--   ROLLBACK;
-- =============================================================================
