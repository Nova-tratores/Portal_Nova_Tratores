-- ════════════════════════════════════════════════════════════════════
-- Lousa Virtual — agenda semanal de serviços por técnico
-- Idempotente: cria do zero OU completa uma tabela já existente.
-- ════════════════════════════════════════════════════════════════════

-- Tabela principal (cria se não existir)
CREATE TABLE IF NOT EXISTS lousa_servicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'servico',   -- 'servico' | 'faltou' | 'feriado' | 'saida'
  cliente_cnpj TEXT,
  cliente_nome TEXT,
  descricao TEXT,
  tecnico_nome TEXT,
  periodo TEXT DEFAULT 'manha',           -- 'manha' | 'tarde'
  cor TEXT DEFAULT '#3b82f6',
  criado_por_id UUID,
  criado_por_nome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- Patch: garante TODAS as colunas caso a tabela já exista incompleta
ALTER TABLE lousa_servicos ADD COLUMN IF NOT EXISTS data DATE;
ALTER TABLE lousa_servicos ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'servico';
ALTER TABLE lousa_servicos ADD COLUMN IF NOT EXISTS cliente_cnpj TEXT;
ALTER TABLE lousa_servicos ADD COLUMN IF NOT EXISTS cliente_nome TEXT;
ALTER TABLE lousa_servicos ADD COLUMN IF NOT EXISTS descricao TEXT;
ALTER TABLE lousa_servicos ADD COLUMN IF NOT EXISTS tecnico_nome TEXT;
ALTER TABLE lousa_servicos ADD COLUMN IF NOT EXISTS periodo TEXT DEFAULT 'manha';
ALTER TABLE lousa_servicos ADD COLUMN IF NOT EXISTS cor TEXT DEFAULT '#3b82f6';
ALTER TABLE lousa_servicos ADD COLUMN IF NOT EXISTS criado_por_id UUID;
ALTER TABLE lousa_servicos ADD COLUMN IF NOT EXISTS criado_por_nome TEXT;
ALTER TABLE lousa_servicos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE lousa_servicos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Config da notificação de PPV (linha única id = 1)
CREATE TABLE IF NOT EXISTS lousa_config (
  id INTEGER PRIMARY KEY,
  notificar_user_id UUID,
  notificar_user_nome TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE lousa_config ADD COLUMN IF NOT EXISTS notificar_user_id UUID;
ALTER TABLE lousa_config ADD COLUMN IF NOT EXISTS notificar_user_nome TEXT;
ALTER TABLE lousa_config ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Índices
CREATE INDEX IF NOT EXISTS idx_lousa_data ON lousa_servicos(data);
CREATE INDEX IF NOT EXISTS idx_lousa_tecnico ON lousa_servicos(tecnico_nome);

-- RLS permissiva (mesmo padrão dos outros módulos, anon key)
ALTER TABLE lousa_servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE lousa_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lousa_select" ON lousa_servicos;
DROP POLICY IF EXISTS "lousa_insert" ON lousa_servicos;
DROP POLICY IF EXISTS "lousa_update" ON lousa_servicos;
DROP POLICY IF EXISTS "lousa_delete" ON lousa_servicos;
CREATE POLICY "lousa_select" ON lousa_servicos FOR SELECT USING (true);
CREATE POLICY "lousa_insert" ON lousa_servicos FOR INSERT WITH CHECK (true);
CREATE POLICY "lousa_update" ON lousa_servicos FOR UPDATE USING (true);
CREATE POLICY "lousa_delete" ON lousa_servicos FOR DELETE USING (true);

DROP POLICY IF EXISTS "lousa_cfg_select" ON lousa_config;
DROP POLICY IF EXISTS "lousa_cfg_insert" ON lousa_config;
DROP POLICY IF EXISTS "lousa_cfg_update" ON lousa_config;
CREATE POLICY "lousa_cfg_select" ON lousa_config FOR SELECT USING (true);
CREATE POLICY "lousa_cfg_insert" ON lousa_config FOR INSERT WITH CHECK (true);
CREATE POLICY "lousa_cfg_update" ON lousa_config FOR UPDATE USING (true);

-- Força o PostgREST a recarregar o schema (resolve "column not found in schema cache")
NOTIFY pgrst, 'reload schema';
