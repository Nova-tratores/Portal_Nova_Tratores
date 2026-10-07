-- =============================================================================
-- BASE DE CONHECIMENTO — entrega 2: o que acontece quando o sistema muda (05/10/2026)
--
-- A cada push na main, o workflow .github/workflows/release-registrar.yml chama
-- POST /api/conhecimento/releases com os commits e os arquivos alterados. O portal:
--   1) grava a versão em sistema_releases;
--   2) marca como "pode estar desatualizado" os artigos PUBLICADOS cujas `fontes`
--      casam com algum arquivo alterado (kb_artigos.revisao_pendente_desde);
--   3) cria um RASCUNHO de novidade por módulo (kb_novidades), redigido pela IA a
--      partir dos commits — o responsável do módulo revisa e publica;
--   4) quem usa o módulo vê a novidade publicada uma vez (kb_novidades_lidas).
--
-- Depende de sql/conhecimento-base.sql. Idempotente. RLS ligado sem policy.
-- O deploy não quebra sem ela: a rota devolve 503 e o workflow só falha (não
-- afeta o portal).
-- =============================================================================

CREATE TABLE IF NOT EXISTS sistema_releases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sha              text NOT NULL UNIQUE,          -- commit do topo do push
  sha_anterior     text,
  commits          jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{sha,titulo,tipo,escopo,autor,data,arquivos[]}]
  arquivos         text[] NOT NULL DEFAULT '{}',  -- união dos arquivos alterados
  modulos          text[] NOT NULL DEFAULT '{}',  -- módulos tocados (escopo dos commits ∪ caminho dos arquivos)
  artigos_afetados integer NOT NULL DEFAULT 0,
  novidades        integer NOT NULL DEFAULT 0,
  resumo           jsonb,
  criado_em        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sistema_releases_criado_idx ON sistema_releases (criado_em DESC);

CREATE TABLE IF NOT EXISTS kb_novidades (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id         uuid REFERENCES sistema_releases(id) ON DELETE SET NULL,
  modulo             text NOT NULL,
  titulo             text NOT NULL,
  texto              text NOT NULL DEFAULT '',     -- markdown simples (lista "- item"); a tela converte em blocos
  status             text NOT NULL DEFAULT 'rascunho'
                       CHECK (status IN ('rascunho','publicado','descartado')),
  origem             text NOT NULL DEFAULT 'ia' CHECK (origem IN ('ia','manual')),
  commits            jsonb NOT NULL DEFAULT '[]'::jsonb,  -- de onde saiu: [{sha,titulo}]
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  publicado_por      uuid,
  publicado_por_nome text,
  publicado_em       timestamptz
);
CREATE INDEX IF NOT EXISTS kb_novidades_status_idx ON kb_novidades (status, publicado_em DESC);
CREATE INDEX IF NOT EXISTS kb_novidades_modulo_idx ON kb_novidades (modulo, status);

CREATE TABLE IF NOT EXISTS kb_novidades_lidas (
  novidade_id uuid NOT NULL REFERENCES kb_novidades(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  lido_em     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (novidade_id, user_id)
);

ALTER TABLE sistema_releases   ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_novidades       ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_novidades_lidas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sistema_releases, kb_novidades, kb_novidades_lidas FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- Conferência: SELECT sha, modulos, artigos_afetados, novidades, criado_em FROM sistema_releases ORDER BY criado_em DESC LIMIT 5;
