-- =============================================================
-- MÓDULO NOTAS DE SAÍDA — espelho das notas fiscais de saída do Omie
-- (NF-e de produto/venda + NFS-e de serviço) para busca rápida no Portal.
-- Execute este SQL no Supabase SQL Editor antes de usar a busca por Supabase.
-- =============================================================

-- Busca por nome de cliente usa ILIKE -> índice trigram (pg_trgm).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Notas de saída (multi-conta NOVA/CASTRO, NF-e produto + NFS-e serviço)
CREATE TABLE IF NOT EXISTS portal_nt_notas_saida (
  conta_omie     TEXT NOT NULL,            -- 'NOVA' | 'CASTRO'
  tipo           TEXT NOT NULL,            -- 'produto' | 'servico'
  n_cod_nf       BIGINT NOT NULL,          -- id interno Omie (nCodNF) = chave do PDF
  numero         TEXT,                     -- como o Omie devolve (NF-e vem com zeros: "00002067")
  numero_int     BIGINT,                   -- numero so digitos -> busca por numero/intervalo
  serie          TEXT,
  chave_nfe      TEXT,
  data_emissao   DATE,
  valor_nf       NUMERIC,
  cancelada      BOOLEAN DEFAULT FALSE,
  cliente_codigo BIGINT,
  cliente_nome   TEXT,
  cliente_doc    TEXT,                     -- só dígitos
  qtde_itens     INTEGER DEFAULT 0,
  raw            JSONB,
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (conta_omie, tipo, n_cod_nf)
);

CREATE INDEX IF NOT EXISTS idx_notas_saida_data       ON portal_nt_notas_saida (conta_omie, data_emissao DESC);
CREATE INDEX IF NOT EXISTS idx_notas_saida_numero     ON portal_nt_notas_saida (conta_omie, numero_int);
CREATE INDEX IF NOT EXISTS idx_notas_saida_cliente    ON portal_nt_notas_saida (conta_omie, cliente_codigo);
CREATE INDEX IF NOT EXISTS idx_notas_saida_nome_trgm  ON portal_nt_notas_saida USING gin (cliente_nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_notas_saida_doc_trgm   ON portal_nt_notas_saida USING gin (cliente_doc gin_trgm_ops);

-- 2. Controle de sync por conta (observabilidade / incremental)
CREATE TABLE IF NOT EXISTS portal_nt_notas_saida_sync (
  conta_omie      TEXT PRIMARY KEY,        -- 'NOVA' | 'CASTRO'
  ultimo_sync     TIMESTAMPTZ,
  ultimo_backfill TIMESTAMPTZ,
  total_notas     INTEGER,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
