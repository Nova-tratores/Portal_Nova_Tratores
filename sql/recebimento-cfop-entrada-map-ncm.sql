-- ============================================================================
-- Evolução do mapa cfop_entrada_map (PR #42): chave passa a incluir NCM.
--
-- Por quê: o mesmo CFOP de saída do fornecedor mapeia para CFOPs de entrada
-- DIFERENTES conforme o produto (ex.: 5.405 → 1.556 E 5.405 → 1.403). O NCM do
-- item desambigua e está disponível até em produto novo (combustível). A chave
-- vira (conta_omie, ncm, cfop_saida). `qtd` guarda os votos do CFOP vencedor
-- (o aprendizado usa voto majoritário sobre os recebimentos concluídos).
--
-- Idempotente. Executar 1× no SQL Editor do Supabase. (Cobre também o caso de a
-- migration do PR #42 ainda não ter sido rodada — recria a tabela se preciso.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS cfop_entrada_map (
  id             BIGSERIAL PRIMARY KEY,
  conta_omie     TEXT NOT NULL,
  cfop_saida     TEXT NOT NULL,
  cfop_entrada   TEXT NOT NULL,
  origem         TEXT NOT NULL DEFAULT 'aprendido',
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_por UUID
);

ALTER TABLE cfop_entrada_map ADD COLUMN IF NOT EXISTS ncm TEXT NOT NULL DEFAULT '';
ALTER TABLE cfop_entrada_map ADD COLUMN IF NOT EXISTS qtd INTEGER NOT NULL DEFAULT 1;

-- troca a unicidade de (conta, cfop_saida) para (conta, ncm, cfop_saida)
ALTER TABLE cfop_entrada_map DROP CONSTRAINT IF EXISTS cfop_entrada_map_key;
DROP INDEX IF EXISTS ux_cfop_entrada_map_ncm;
CREATE UNIQUE INDEX IF NOT EXISTS ux_cfop_entrada_map_ncm
  ON cfop_entrada_map (conta_omie, ncm, cfop_saida);

CREATE INDEX IF NOT EXISTS idx_cfop_entrada_map_conta ON cfop_entrada_map(conta_omie);
