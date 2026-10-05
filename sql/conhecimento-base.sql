-- =============================================================================
-- BASE DE CONHECIMENTO (KMS) — entrega 1 do piloto Pós-Vendas (02/10/2026)
--
-- Um artigo é a fonte da verdade da ajuda de uma tela/procedimento. A ajuda do
-- botão "?" do cabeçalho, a busca em /conhecimento e (fases seguintes) o
-- treinamento e o Tratorilson leem daqui.
--
-- Padrão do portal desde 28/09: RLS LIGADO SEM POLICY + REVOKE de anon e
-- authenticated. Tudo passa por /api/conhecimento/* com service role.
--
-- Idempotente: pode rodar mais de uma vez. O deploy NÃO quebra sem ela: as rotas
-- devolvem 503 "migration pendente" e o botão "?" simplesmente não aparece.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1) Artigos
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kb_artigos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               text NOT NULL UNIQUE,
  titulo             text NOT NULL,
  tipo               text NOT NULL DEFAULT 'tela'
                       CHECK (tipo IN ('tela','procedimento','regra','faq','produto')),
  modulo             text NOT NULL,                 -- id do catálogo de permissões (pos, garantias, …) ou 'geral'
  telas              text[] NOT NULL DEFAULT '{}',  -- pathnames que o artigo documenta (/pos, /garantias, …)
  fontes             text[] NOT NULL DEFAULT '{}',  -- globs de código vigiados na fase 2 (src/lib/pos/**)
  resumo             text,
  corpo              jsonb NOT NULL DEFAULT '[]'::jsonb,   -- blocos tipados (lib/conhecimento/blocos.ts)
  tags               text[] NOT NULL DEFAULT '{}',
  publico            text[] NOT NULL DEFAULT '{}',  -- categorias de portal_permissoes; vazio = quem tem o módulo
  ordem              integer NOT NULL DEFAULT 0,    -- ordem dentro da tela
  status             text NOT NULL DEFAULT 'rascunho'
                       CHECK (status IN ('rascunho','publicado','arquivado')),
  versao             integer NOT NULL DEFAULT 0,    -- 0 = nunca publicado
  -- edição pendente de um artigo JÁ publicado: {titulo,resumo,corpo,tipo,telas,tags,ordem}.
  -- O leitor continua vendo o publicado até alguém aprovar.
  rascunho           jsonb,
  rascunho_por       text,
  rascunho_em        timestamptz,
  origem             text NOT NULL DEFAULT 'manual'
                       CHECK (origem IN ('manual','ia','seed','entrega')),
  -- fase 2 (mudança do sistema): quando uma versão nova tocou nas fontes do artigo
  revisao_pendente_desde timestamptz,
  revisao_motivo     jsonb,
  revisar_ate        date,                          -- validade: depois disso pede revisão
  texto_busca        text NOT NULL DEFAULT '',      -- título + resumo + corpo, minúsculo e sem acento (escrito pelo app)
  busca              tsvector GENERATED ALWAYS AS (to_tsvector('simple', texto_busca)) STORED,
  criado_por         uuid,
  criado_por_nome    text,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  publicado_por      uuid,
  publicado_por_nome text,
  publicado_em       timestamptz,
  atualizado_em      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kb_artigos_busca_idx  ON kb_artigos USING gin (busca);
CREATE INDEX IF NOT EXISTS kb_artigos_telas_idx  ON kb_artigos USING gin (telas);
CREATE INDEX IF NOT EXISTS kb_artigos_modulo_idx ON kb_artigos (modulo, status);

-- ----------------------------------------------------------------------------
-- 2) Versões publicadas (snapshot a cada publicação)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kb_artigo_versoes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artigo_id          uuid NOT NULL REFERENCES kb_artigos(id) ON DELETE CASCADE,
  versao             integer NOT NULL,
  titulo             text NOT NULL,
  resumo             text,
  corpo              jsonb NOT NULL,
  resumo_mudanca     text,                          -- "o que mudou" em uma frase
  relevante          boolean NOT NULL DEFAULT false, -- mudança que pede reciclagem (fase 3)
  publicado_por      uuid,
  publicado_por_nome text,
  publicado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (artigo_id, versao)
);

-- ----------------------------------------------------------------------------
-- 3) Retorno do leitor: "ajudou", "não ajudou", "está desatualizado"
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kb_feedback (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artigo_id    uuid NOT NULL REFERENCES kb_artigos(id) ON DELETE CASCADE,
  versao       integer NOT NULL DEFAULT 0,
  user_id      uuid NOT NULL,
  user_nome    text,
  tipo         text NOT NULL CHECK (tipo IN ('ajudou','nao_ajudou','desatualizado')),
  comentario   text,
  tela         text,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  resolvido_em timestamptz,
  resolvido_por text
);
CREATE INDEX IF NOT EXISTS kb_feedback_artigo_idx ON kb_feedback (artigo_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS kb_feedback_aberto_idx ON kb_feedback (tipo) WHERE resolvido_em IS NULL;

-- ----------------------------------------------------------------------------
-- 4) Leituras (quem abriu qual versão) — alimenta lacunas e, na fase 3, o treinamento
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kb_leituras (
  artigo_id  uuid NOT NULL REFERENCES kb_artigos(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  versao     integer NOT NULL,
  tela       text,
  lido_em    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artigo_id, user_id, versao)
);

-- ----------------------------------------------------------------------------
-- 5) Responsável por módulo: quem aprova os rascunhos (inclusive os da IA)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kb_responsaveis (
  modulo        text PRIMARY KEY,
  user_id       uuid NOT NULL,
  user_nome     text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Piloto Pós-Vendas: Henri Irneh aprova os módulos que o guia do Pós-Venda cobre.
INSERT INTO kb_responsaveis (modulo, user_id, user_nome)
SELECT m.modulo, u.id, u.nome
FROM (VALUES ('pos'),('garantias'),('revisoes'),('sat'),('ppv'),('feedbacks'),('requisicoes'),('tickets')) AS m(modulo)
CROSS JOIN LATERAL (
  SELECT id, nome FROM financeiro_usu WHERE nome ILIKE 'Henri Irneh%' ORDER BY nome LIMIT 1
) u
ON CONFLICT (modulo) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 6) Segurança: RLS ligado, sem policy; nada pelo navegador
-- ----------------------------------------------------------------------------
ALTER TABLE kb_artigos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_artigo_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_feedback       ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_leituras       ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_responsaveis   ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON kb_artigos, kb_artigo_versoes, kb_feedback, kb_leituras, kb_responsaveis FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- Conferência rápida depois de rodar:
--   SELECT modulo, user_nome FROM kb_responsaveis ORDER BY 1;   -- 8 linhas com Henri Irneh
--   SELECT count(*) FROM kb_artigos;                            -- 0 até rodar o seed
