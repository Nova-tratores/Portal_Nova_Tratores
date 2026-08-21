-- ============================================================================
-- Mapa "CFOP do fornecedor (saída) → CFOP de entrada" aprendido pelo portal.
--
-- Por quê: quando a Omie NÃO traz o CFOP de entrada de um item (produto novo,
-- ex.: combustível), o portal cai no equivalente calculado (5→1/6→2) — que a Omie
-- RECUSA se não estiver habilitado na empresa ("CFOP de entrada 1653 não está
-- cadastrado nesta empresa"). A Omie não expõe via API o CFOP de entrada do
-- cadastro do produto/fornecedor, então o portal APRENDE: guarda, por CFOP de saída
-- do fornecedor, o CFOP de entrada usado numa entrada CONCLUÍDA COM SUCESSO (logo,
-- aceito pela Omie) e pré-preenche com ele na próxima. É o "Painel do Contador" do portal.
--
-- conta_omie é MINÚSCULO ('nova'/'castro'). cfop_saida/cfop_entrada guardam só
-- dígitos (ex.: '5653' / '1653'). Idempotente. Executar 1× no SQL Editor do Supabase.
-- ============================================================================

CREATE TABLE IF NOT EXISTS cfop_entrada_map (
  id             BIGSERIAL PRIMARY KEY,
  conta_omie     TEXT NOT NULL,                 -- minusculo: nova/castro
  cfop_saida     TEXT NOT NULL,                 -- CFOP do fornecedor (só dígitos)
  cfop_entrada   TEXT NOT NULL,                 -- CFOP de entrada aceito (só dígitos)
  origem         TEXT NOT NULL DEFAULT 'aprendido',   -- 'aprendido' | 'manual'
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_por UUID,
  CONSTRAINT cfop_entrada_map_key UNIQUE (conta_omie, cfop_saida)
);

CREATE INDEX IF NOT EXISTS idx_cfop_entrada_map_conta ON cfop_entrada_map(conta_omie);
