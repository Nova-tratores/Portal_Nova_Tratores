-- =============================================================================
-- Inspeção de pré-entrega + Observações por trator + Pendência Mahindra em OS
-- =============================================================================

-- 1) Colunas de inspeção de pré-entrega na tabela `tratores`
ALTER TABLE tratores
  ADD COLUMN IF NOT EXISTS "Inspecao Data" TEXT,
  ADD COLUMN IF NOT EXISTS "Inspecao Horimetro" TEXT,
  ADD COLUMN IF NOT EXISTS "Inspecao PDF" TEXT;

-- 2) Tabela de registro de e-mails de inspeção (espelho de `revisao_emails`)
CREATE TABLE IF NOT EXISTS inspecao_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chassis TEXT NOT NULL,
  chassis_final TEXT NOT NULL,
  horimetro TEXT,
  modelo TEXT,
  cliente TEXT,
  assunto TEXT,
  destinatarios JSONB,
  corpo TEXT,
  pdf_url TEXT,
  enviado_por TEXT,
  enviado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inspecao_emails_chassis_final ON inspecao_emails(chassis_final);
CREATE INDEX IF NOT EXISTS idx_inspecao_emails_enviado_em  ON inspecao_emails(enviado_em DESC);

-- 3) Tabela de observações por trator (timeline com histórico)
CREATE TABLE IF NOT EXISTS trator_observacoes (
  id BIGSERIAL PRIMARY KEY,
  trator_id TEXT NOT NULL,
  chassis TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'geral'
    CHECK (tipo IN ('geral','em_banco','certificado_pendente','pendencia_cliente','outro')),
  texto TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','resolvida')),
  criado_por_email TEXT,
  criado_por_nome  TEXT,
  resolvido_por_nome TEXT,
  resolvido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trator_obs_trator   ON trator_observacoes(trator_id);
CREATE INDEX IF NOT EXISTS idx_trator_obs_chassis  ON trator_observacoes(chassis);
CREATE INDEX IF NOT EXISTS idx_trator_obs_tipo     ON trator_observacoes(tipo);
CREATE INDEX IF NOT EXISTS idx_trator_obs_created  ON trator_observacoes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trator_obs_status   ON trator_observacoes(status);

-- 4) Coluna de cache de pendência Mahindra em Ordem_Servico
ALTER TABLE "Ordem_Servico"
  ADD COLUMN IF NOT EXISTS pendencia_mahindra JSONB;

-- 5) Tabela de destinatários extras de revisão (caderno de contatos reutilizável)
CREATE TABLE IF NOT EXISTS revisao_destinatarios (
  email TEXT PRIMARY KEY,
  nome  TEXT NOT NULL
);

-- 6) Scheila Kronbauer — destinatária fixa Mahindra
INSERT INTO revisao_destinatarios (nome, email)
VALUES ('Scheila', 'kronbauer.scheila@mahindrabrazil.com')
ON CONFLICT (email) DO NOTHING;

-- 7) RLS habilitado + políticas permissivas para o app
ALTER TABLE inspecao_emails       ENABLE ROW LEVEL SECURITY;
ALTER TABLE trator_observacoes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE revisao_destinatarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inspecao_emails_all"       ON inspecao_emails;
DROP POLICY IF EXISTS "trator_observacoes_all"    ON trator_observacoes;
DROP POLICY IF EXISTS "revisao_destinatarios_all" ON revisao_destinatarios;

CREATE POLICY "inspecao_emails_all"       ON inspecao_emails
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "trator_observacoes_all"    ON trator_observacoes
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "revisao_destinatarios_all" ON revisao_destinatarios
  FOR ALL USING (true) WITH CHECK (true);
