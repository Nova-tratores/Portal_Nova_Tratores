-- Cache persistente de listagens Omie (categorias, contas correntes, projetos, vendedores, tipos de documento).
-- Refresh: TTL 24h ou manual via endpoint POST /api/financeiro/contas-pagar/omie/refresh-cache.

CREATE TABLE IF NOT EXISTS "omie_cache" (
  empresa     TEXT NOT NULL,        -- 'Nova Tratores' | 'Castro Peças'
  tipo        TEXT NOT NULL,        -- 'categorias' | 'contas' | 'projetos' | 'vendedores' | 'tipos_documento'
  codigo      TEXT NOT NULL,        -- código/id do item no Omie (string para uniformizar; converter no leitor)
  descricao   TEXT,                 -- nome/descrição do item
  payload     JSONB,                -- campos extras (ex. tipo_conta_corrente para contas, nome p/ projetos, etc.)
  atualizado  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (empresa, tipo, codigo)
);

CREATE INDEX IF NOT EXISTS idx_omie_cache_empresa_tipo
  ON "omie_cache" (empresa, tipo);

-- Índice de "freshness" — consulta MAX(atualizado) por (empresa, tipo) para decidir refresh.
CREATE INDEX IF NOT EXISTS idx_omie_cache_atualizado
  ON "omie_cache" (empresa, tipo, atualizado DESC);
