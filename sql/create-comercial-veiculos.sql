-- ════════════════════════════════════════════════════════════════════
-- Carros do Comercial — vínculo carro ↔ pessoa (usuário do portal OU vendedor)
-- + garante a tabela de histórico de rotas (rotas_vendedor)
-- ════════════════════════════════════════════════════════════════════

-- Vínculo gerenciado pelo admin
CREATE TABLE IF NOT EXISTS comercial_veiculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placa TEXT NOT NULL,
  descricao TEXT,                       -- modelo/descrição do carro
  adesao_id BIGINT,                     -- id do veículo na Rota Exata (cache)
  vinculo_tipo TEXT NOT NULL DEFAULT 'portal', -- 'portal' | 'vendedor'
  pessoa_id TEXT,                       -- financeiro_usu.id ou vendedores.id
  pessoa_nome TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (placa)
);

CREATE INDEX IF NOT EXISTS idx_comercial_veiculos_ativo ON comercial_veiculos(ativo);

ALTER TABLE comercial_veiculos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comv_select" ON comercial_veiculos;
DROP POLICY IF EXISTS "comv_insert" ON comercial_veiculos;
DROP POLICY IF EXISTS "comv_update" ON comercial_veiculos;
DROP POLICY IF EXISTS "comv_delete" ON comercial_veiculos;
CREATE POLICY "comv_select" ON comercial_veiculos FOR SELECT USING (true);
CREATE POLICY "comv_insert" ON comercial_veiculos FOR INSERT WITH CHECK (true);
CREATE POLICY "comv_update" ON comercial_veiculos FOR UPDATE USING (true);
CREATE POLICY "comv_delete" ON comercial_veiculos FOR DELETE USING (true);

-- ── Histórico de rotas (reaproveitado dos vendedores) ──
CREATE TABLE IF NOT EXISTS rotas_vendedor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placa TEXT NOT NULL,
  data DATE NOT NULL,
  vendedor_id TEXT,
  vendedor_nome TEXT,
  pontos JSONB DEFAULT '[]'::jsonb,
  paradas JSONB DEFAULT '[]'::jsonb,
  km_total NUMERIC DEFAULT 0,
  hora_inicio TIMESTAMPTZ,
  hora_fim TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (placa, data)
);
ALTER TABLE rotas_vendedor ADD COLUMN IF NOT EXISTS vendedor_id TEXT;
ALTER TABLE rotas_vendedor ADD COLUMN IF NOT EXISTS vendedor_nome TEXT;
ALTER TABLE rotas_vendedor ADD COLUMN IF NOT EXISTS pontos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE rotas_vendedor ADD COLUMN IF NOT EXISTS paradas JSONB DEFAULT '[]'::jsonb;
ALTER TABLE rotas_vendedor ADD COLUMN IF NOT EXISTS km_total NUMERIC DEFAULT 0;
ALTER TABLE rotas_vendedor ADD COLUMN IF NOT EXISTS hora_inicio TIMESTAMPTZ;
ALTER TABLE rotas_vendedor ADD COLUMN IF NOT EXISTS hora_fim TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_rotas_vendedor_placa_data ON rotas_vendedor(placa, data);

ALTER TABLE rotas_vendedor ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rotasv_select" ON rotas_vendedor;
DROP POLICY IF EXISTS "rotasv_insert" ON rotas_vendedor;
DROP POLICY IF EXISTS "rotasv_update" ON rotas_vendedor;
CREATE POLICY "rotasv_select" ON rotas_vendedor FOR SELECT USING (true);
CREATE POLICY "rotasv_insert" ON rotas_vendedor FOR INSERT WITH CHECK (true);
CREATE POLICY "rotasv_update" ON rotas_vendedor FOR UPDATE USING (true);

NOTIFY pgrst, 'reload schema';
