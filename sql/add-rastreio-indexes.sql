-- ============================================================================
-- RASTREIO DE NOTAS — índices de busca (19/08/2026)
-- A busca faz ilike em numero_nota/numero_NF (trgm) e eq em numero_boleto/
-- numero_documento_fiscal do espelho DRE. pg_trgm já é usada pelo módulo de
-- notas de saída. Idempotente. Rodar no SQL Editor do Supabase.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_requisicao_numero_nota_trgm ON "Requisicao" USING gin (numero_nota gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_finan_pagar_numero_nf_trgm  ON "finan_pagar" USING gin ("numero_NF" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contas_pagar_numero_boleto   ON contas_pagar (numero_boleto);
CREATE INDEX IF NOT EXISTS idx_contas_receber_numero_boleto ON contas_receber (numero_boleto);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_doc_fiscal      ON contas_pagar (numero_documento_fiscal);
CREATE INDEX IF NOT EXISTS idx_contas_receber_doc_fiscal    ON contas_receber (numero_documento_fiscal);

NOTIFY pgrst, 'reload schema';
