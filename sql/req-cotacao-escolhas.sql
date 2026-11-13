-- REQUISIÇÕES — cotação INDICADA × COMPRADA, link por cotação e
-- "quem aprovou a compra" (12/11/2026). Rodar no SQL Editor. Idempotente.
--
-- req_cotacao (legado AppSheet, 1:1 com "Requisicao", escrita pelo navegador):
--   linkN          = link do produto/orçamento do fornecedor N
--   indicada       = nº (1..5) da cotação que quem montou o mapa indicou
--   comprada       = nº (1..5) da cotação que foi de fato comprada (quem lança a nota)
--   *_por / *_em   = quem marcou e quando
-- "Requisicao":
--   compra_aprovada_* = quem clicou em "Aprovar compra" (gravado só pela rota
--   /api/requisicoes/[id]/aprovar-compra, com o usuário do login)
--
-- Sem esta migration o portal segue: o mapa salva sem os campos novos e a
-- aprovação responde 503 avisando.

ALTER TABLE req_cotacao
  ADD COLUMN IF NOT EXISTS link1 TEXT,
  ADD COLUMN IF NOT EXISTS link2 TEXT,
  ADD COLUMN IF NOT EXISTS link3 TEXT,
  ADD COLUMN IF NOT EXISTS link4 TEXT,
  ADD COLUMN IF NOT EXISTS link5 TEXT,
  ADD COLUMN IF NOT EXISTS indicada SMALLINT,
  ADD COLUMN IF NOT EXISTS indicada_por TEXT,
  ADD COLUMN IF NOT EXISTS indicada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS comprada SMALLINT,
  ADD COLUMN IF NOT EXISTS comprada_por TEXT,
  ADD COLUMN IF NOT EXISTS comprada_em TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'req_cotacao_indicada_1a5') THEN
    ALTER TABLE req_cotacao ADD CONSTRAINT req_cotacao_indicada_1a5 CHECK (indicada IS NULL OR indicada BETWEEN 1 AND 5);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'req_cotacao_comprada_1a5') THEN
    ALTER TABLE req_cotacao ADD CONSTRAINT req_cotacao_comprada_1a5 CHECK (comprada IS NULL OR comprada BETWEEN 1 AND 5);
  END IF;
END $$;

COMMENT ON COLUMN req_cotacao.indicada IS 'Nº (1..5) da cotação indicada por quem montou o mapa';
COMMENT ON COLUMN req_cotacao.comprada IS 'Nº (1..5) da cotação comprada (marcada por quem lançou a nota)';

ALTER TABLE "Requisicao"
  ADD COLUMN IF NOT EXISTS compra_aprovada_por TEXT,
  ADD COLUMN IF NOT EXISTS compra_aprovada_email TEXT,
  ADD COLUMN IF NOT EXISTS compra_aprovada_em TIMESTAMPTZ;

COMMENT ON COLUMN "Requisicao".compra_aprovada_por IS 'Quem aprovou a compra (botão "Aprovar compra", usuário do login)';

NOTIFY pgrst, 'reload schema';

-- PÓS-CHECK:
-- SELECT id, link1, indicada, comprada FROM req_cotacao LIMIT 1;
-- SELECT id, compra_aprovada_por, compra_aprovada_em FROM "Requisicao" LIMIT 1;
