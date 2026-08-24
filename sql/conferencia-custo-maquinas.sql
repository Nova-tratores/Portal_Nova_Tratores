-- =============================================================================
-- Conferência de custo das máquinas do pátio (tela de uso único).
-- Guarda, por máquina em estoque, os valores de custo levantados ao ligar
-- para cada fornecedor: custo que pagamos, custo acumulado e custo atual na
-- fábrica. O custo do portal (cmc) NÃO fica aqui — é lido ao vivo da tabela
-- `produtos` e só guardamos um snapshot para referência histórica.
--
-- Chave natural: (codigo_produto, conta_omie) — mesma chave da tabela produtos.
-- Escrita SÓ via /api/conferencia-custos (service role). RLS liga sem policy,
-- então anon/authenticated não leem direto (service role ignora RLS).
-- =============================================================================

CREATE TABLE IF NOT EXISTS conferencia_custo_maquinas (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo_produto   BIGINT NOT NULL,
  conta_omie       TEXT   NOT NULL DEFAULT '',
  -- snapshots (referência do que estava no portal na hora da conferência)
  codigo           TEXT,
  descricao        TEXT,
  cmc_portal       NUMERIC,
  -- valores levantados com o fornecedor
  fornecedor       TEXT,
  custo_pago       NUMERIC,
  custo_acumulado  NUMERIC,
  custo_fabrica    NUMERIC,
  contatado        BOOLEAN NOT NULL DEFAULT FALSE,
  observacao       TEXT,
  -- auditoria
  atualizado_por   TEXT,
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (codigo_produto, conta_omie)
);

ALTER TABLE conferencia_custo_maquinas ENABLE ROW LEVEL SECURITY;
