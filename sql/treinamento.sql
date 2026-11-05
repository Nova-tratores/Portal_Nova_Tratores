-- =============================================================================
-- TREINAMENTO (LMS) — entrega 3 do piloto Pós-Vendas (05/11/2026)
--
-- O treinamento NÃO tem conteúdo próprio: uma trilha é uma sequência de artigos
-- PUBLICADOS da base de conhecimento (kb_artigos) + uma prova de múltipla escolha.
-- Decisões do usuário (02/10): prova com nota mínima 70 %, prazo de 7 dias,
-- reciclagem quando um artigo da trilha é republicado como "mudança relevante".
--
-- Padrão: RLS LIGADO SEM POLICY + REVOKE; tudo por /api/treinamento/* (service role).
-- Depende de sql/conhecimento-base.sql. Idempotente. O deploy não quebra sem ela
-- (503 migracaoFaltando; as telas avisam).
-- =============================================================================

CREATE TABLE IF NOT EXISTS lms_trilhas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo           text NOT NULL,
  descricao        text,
  modulo           text NOT NULL,                  -- id do módulo (pos, garantias…) — quem é responsável do módulo gere
  publico          text[] NOT NULL DEFAULT '{}',   -- categorias de portal_permissoes que recebem a trilha sozinhas
  obrigatoria      boolean NOT NULL DEFAULT true,
  nota_minima      integer NOT NULL DEFAULT 70 CHECK (nota_minima BETWEEN 0 AND 100),
  prazo_dias       integer NOT NULL DEFAULT 7 CHECK (prazo_dias BETWEEN 1 AND 365),
  status           text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','ativa','arquivada')),
  criado_por       uuid,
  criado_por_nome  text,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lms_etapas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trilha_id   uuid NOT NULL REFERENCES lms_trilhas(id) ON DELETE CASCADE,
  ordem       integer NOT NULL DEFAULT 0,
  artigo_id   uuid NOT NULL REFERENCES kb_artigos(id) ON DELETE RESTRICT,
  UNIQUE (trilha_id, artigo_id)
);
CREATE INDEX IF NOT EXISTS lms_etapas_trilha_idx ON lms_etapas (trilha_id, ordem);
CREATE INDEX IF NOT EXISTS lms_etapas_artigo_idx ON lms_etapas (artigo_id);

CREATE TABLE IF NOT EXISTS lms_perguntas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trilha_id   uuid NOT NULL REFERENCES lms_trilhas(id) ON DELETE CASCADE,
  artigo_id   uuid REFERENCES kb_artigos(id) ON DELETE SET NULL,   -- de qual artigo a pergunta vem (reciclagem usa)
  ordem       integer NOT NULL DEFAULT 0,
  enunciado   text NOT NULL,
  opcoes      jsonb NOT NULL DEFAULT '[]'::jsonb,  -- ["texto", "texto", …] (2 a 6)
  correta     integer NOT NULL DEFAULT 0,          -- índice em opcoes
  explicacao  text,
  ativa       boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS lms_perguntas_trilha_idx ON lms_perguntas (trilha_id, ordem);

CREATE TABLE IF NOT EXISTS lms_atribuicoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trilha_id     uuid NOT NULL REFERENCES lms_trilhas(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,
  user_nome     text,
  ciclo         integer NOT NULL DEFAULT 1,         -- 1 = trilha inteira; >1 = reciclagem
  origem        text NOT NULL DEFAULT 'categoria' CHECK (origem IN ('categoria','manual','reciclagem')),
  etapas        uuid[],                             -- NULL = todas; reciclagem = só as etapas do artigo que mudou
  prazo         date NOT NULL,
  situacao      text NOT NULL DEFAULT 'pendente' CHECK (situacao IN ('pendente','em_andamento','concluida')),
  nota          integer,                            -- última nota da prova
  tentativas    integer NOT NULL DEFAULT 0,
  concluida_em  timestamptz,
  motivo        text,                               -- reciclagem: "Artigo X mudou (v3)"
  criado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trilha_id, user_id, ciclo)
);
CREATE INDEX IF NOT EXISTS lms_atribuicoes_user_idx ON lms_atribuicoes (user_id, situacao);
CREATE INDEX IF NOT EXISTS lms_atribuicoes_trilha_idx ON lms_atribuicoes (trilha_id, situacao);

CREATE TABLE IF NOT EXISTS lms_progresso (
  atribuicao_id  uuid NOT NULL REFERENCES lms_atribuicoes(id) ON DELETE CASCADE,
  etapa_id       uuid NOT NULL REFERENCES lms_etapas(id) ON DELETE CASCADE,
  versao_artigo  integer NOT NULL DEFAULT 0,        -- versão do artigo lida
  concluida_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (atribuicao_id, etapa_id)
);

CREATE TABLE IF NOT EXISTS lms_tentativas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atribuicao_id  uuid NOT NULL REFERENCES lms_atribuicoes(id) ON DELETE CASCADE,
  respostas      jsonb NOT NULL DEFAULT '{}'::jsonb, -- {pergunta_id: índice}
  acertos        integer NOT NULL DEFAULT 0,
  total          integer NOT NULL DEFAULT 0,
  nota           integer NOT NULL DEFAULT 0,
  aprovado       boolean NOT NULL DEFAULT false,
  criado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lms_tentativas_atrib_idx ON lms_tentativas (atribuicao_id, criado_em DESC);

ALTER TABLE lms_trilhas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_etapas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_perguntas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_atribuicoes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_progresso    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_tentativas   ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lms_trilhas, lms_etapas, lms_perguntas, lms_atribuicoes, lms_progresso, lms_tentativas FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- Depois: npx tsx --env-file=.env.local scripts/treinamento-seed-pos.ts  (trilha piloto do Pós-Vendas)
