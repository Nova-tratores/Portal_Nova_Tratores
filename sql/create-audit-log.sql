-- Tabela de auditoria detalhada do Portal Corporativo
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  user_nome TEXT NOT NULL,

  -- Qual sistema (revisoes, requisicoes, pos, ppv, financeiro, propostas)
  sistema TEXT NOT NULL,

  -- Ação realizada (criar, editar, deletar, visualizar, enviar_email, mover_status, upload, etc)
  acao TEXT NOT NULL,

  -- Entidade afetada (nome da tabela/tipo: trator, requisicao, ordem_servico, etc)
  entidade TEXT,

  -- ID do card/registro afetado
  entidade_id TEXT,

  -- Label legível (ex: "Requisição #45 - Peças Motor", "Trator MF8737 ABCD")
  entidade_label TEXT,

  -- Detalhes da mudança em JSON (ex: {"campo": "fornecedor", "de": "ABC", "para": "XYZ"})
  detalhes JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_sistema ON audit_log(sistema);
CREATE INDEX IF NOT EXISTS idx_audit_log_entidade ON audit_log(entidade, entidade_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_sistema_created ON audit_log(sistema, created_at DESC);

-- RLS desabilitado (mesmo padrão das outras tabelas)
ALTER TABLE audit_log DISABLE ROW LEVEL SECURITY;
