-- Contas recorrentes do Financeiro (03/11/2026): o que a pessoa decidiu sobre um aviso.
-- Projeto Supabase do PORTAL (citrhumdkfivdzbmayde). Usado por /api/financeiro/recorrentes.
--   ja_lancei      → aquele mês está resolvido (ex.: lançado com outro fornecedor)
--   pular_mes      → aquele mês não vai ter a conta
--   nao_recorrente → para de acompanhar esse fornecedor + categoria (mes fica nulo)

CREATE TABLE IF NOT EXISTS "finan_recorrentes_decisoes" (
  id                 BIGSERIAL PRIMARY KEY,
  empresa            TEXT NOT NULL,          -- conta_omie: 'NOVA' | 'CASTRO'
  fornecedor_codigo  BIGINT NOT NULL,        -- codigo_cliente_fornecedor do Omie
  categoria          TEXT,                   -- codigo_categoria do Omie
  fornecedor_nome    TEXT,
  tipo               TEXT NOT NULL CHECK (tipo IN ('ja_lancei', 'pular_mes', 'nao_recorrente')),
  mes                TEXT,                   -- 'AAAA-MM' (nulo em nao_recorrente)
  criado_por         UUID,
  criado_por_nome    TEXT,
  criado_em          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finan_rec_dec_forn
  ON "finan_recorrentes_decisoes" (empresa, fornecedor_codigo);

-- Só o servidor (service_role) lê e grava.
ALTER TABLE "finan_recorrentes_decisoes" ENABLE ROW LEVEL SECURITY;
