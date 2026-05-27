-- Tabela de ocorrencias dos mecanicos
-- Executar no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS mecanico_ocorrencias (
  id BIGSERIAL PRIMARY KEY,
  tecnico_nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'geral',        -- 'atraso', 'falta', 'advertencia', 'elogio', 'observacao', 'geral'
  titulo TEXT NOT NULL,
  descricao TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendente',    -- 'pendente', 'resolvida', 'cancelada'
  resposta TEXT DEFAULT '',
  criado_por TEXT DEFAULT 'portal',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index para busca por tecnico
CREATE INDEX IF NOT EXISTS idx_ocorrencias_tecnico ON mecanico_ocorrencias(tecnico_nome);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_status ON mecanico_ocorrencias(status);

-- RLS (permitir acesso anonimo para o portal)
ALTER TABLE mecanico_ocorrencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total mecanico_ocorrencias" ON mecanico_ocorrencias FOR ALL USING (true) WITH CHECK (true);
