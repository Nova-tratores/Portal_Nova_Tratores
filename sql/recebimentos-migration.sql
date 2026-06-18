-- ============================================================================
-- Recebimento de NF-e de Fornecedor (tela /estoque/recebimentos)
--
-- A FONTE de recebimentos JA EXISTE: tabela `recebimentos_nfe` (mesmo Supabase,
-- projeto citrhumdkfivdzbmayde). Ela tem etapa/status/fornecedor/maquinas/produtos
-- e ja e populada por um pipeline existente (≈14k linhas). conta_omie e MINUSCULO
-- ('nova'/'castro').
--
-- Esta migration cria APENAS a "camada nossa" sobre os recebimentos:
--   - recebimento_meta:     tipo manual + responsavel + categoria por id_receb
--   - recebimento_usuarios: lista de gente p/ transferencia
--
-- OBS (2026-06): ao portar para o Portal, verificou-se que recebimento_meta e
-- recebimento_usuarios JA EXISTEM no banco com este mesmo schema. Esta migration
-- e IDEMPOTENTE (IF NOT EXISTS) — rode-a mesmo assim para garantir os indices/
-- triggers em ambientes onde so as tabelas existem.
--
-- Status: pendente = status='Faturada' (etapa 40); concluido = status='Recebida'.
-- Concluir/Reabrir escrevem no Omie (ConcluirRecebimento cEtapa=60 / Reverter).
--
-- Executar 1x no SQL Editor do Supabase. Idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION receb_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- recebimento_meta - camada nossa sobre recebimentos_nfe (chave id_receb)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recebimento_meta (
  id               BIGSERIAL PRIMARY KEY,
  conta_omie       TEXT NOT NULL,                 -- minusculo: nova/castro
  id_receb         BIGINT NOT NULL,               -- = recebimentos_nfe.id_receb
  tipo             TEXT CHECK (tipo IN ('almoxarifado','maquinas','pecas','pecas_garantia')),
  tipo_manual      BOOLEAN NOT NULL DEFAULT FALSE,-- true = sobrepoe a classificacao automatica
  responsavel      TEXT,                          -- email/nome; null = nao atribuido
  codigo_categoria TEXT,                          -- categoria escolhida na conclusao
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recebimento_meta_conta_id_key UNIQUE (conta_omie, id_receb)
);

CREATE INDEX IF NOT EXISTS idx_receb_meta_conta       ON recebimento_meta(conta_omie);
CREATE INDEX IF NOT EXISTS idx_receb_meta_responsavel ON recebimento_meta(responsavel);

DROP TRIGGER IF EXISTS trg_receb_meta_touch ON recebimento_meta;
CREATE TRIGGER trg_receb_meta_touch
  BEFORE UPDATE ON recebimento_meta
  FOR EACH ROW EXECUTE FUNCTION receb_touch_updated_at();

-- ----------------------------------------------------------------------------
-- recebimento_usuarios - lista de gente p/ transferencia (atribuicao livre)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recebimento_usuarios (
  id          BIGSERIAL PRIMARY KEY,
  conta_omie  TEXT NOT NULL,                       -- minusculo: nova/castro
  email       TEXT,
  nome        TEXT NOT NULL,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recebimento_usuarios_conta_nome_key UNIQUE (conta_omie, nome)
);

DROP TRIGGER IF EXISTS trg_recebimento_usuarios_touch ON recebimento_usuarios;
CREATE TRIGGER trg_recebimento_usuarios_touch
  BEFORE UPDATE ON recebimento_usuarios
  FOR EACH ROW EXECUTE FUNCTION receb_touch_updated_at();
