-- =====================================================================
-- MAPA DE COTAÇÕES — anexo por fornecedor (req_cotacao.anexo1..5)
-- Rodar no SQL Editor do Supabase. Idempotente.
--
-- req_cotacao é legado do AppSheet: 1:1 com "Requisicao" (PK = id dela),
-- "wide" (fornecedor1..5, servico_material1..5, valor1..5, obs1..5,
-- incluir_pdf). NÃO tem CREATE versionado nem RLS — a tela escreve direto
-- do browser (anon key). Esta migration só ACRESCENTA colunas; não muda isso.
--
-- anexoN guarda o PATH RELATIVO no bucket público `requisicoes`, no mesmo
-- idioma de "Requisicao".foto_nf (URL resolvida por getUrlAnexo em
-- src/lib/requisicoes/anexos.ts). Nome do arquivo: {reqId}-cotacao{N}-{ts}.{ext}.
-- ⚠️ Aplicar ANTES do deploy: o "Salvar" do mapa faz upsert com todas as
-- colunas do estado — sem estas colunas o salvar inteiro passa a falhar.
-- =====================================================================

ALTER TABLE req_cotacao
  ADD COLUMN IF NOT EXISTS anexo1 TEXT,
  ADD COLUMN IF NOT EXISTS anexo2 TEXT,
  ADD COLUMN IF NOT EXISTS anexo3 TEXT,
  ADD COLUMN IF NOT EXISTS anexo4 TEXT,
  ADD COLUMN IF NOT EXISTS anexo5 TEXT;

COMMENT ON COLUMN req_cotacao.anexo1 IS 'Anexo da cotação 1: path no bucket requisicoes (ex.: 6423-cotacao1-1725800000000.pdf)';
COMMENT ON COLUMN req_cotacao.obs1   IS 'Observação livre da cotação 1 (prazo, frete, condição de pagamento). Sai no PDF.';

NOTIFY pgrst, 'reload schema';

-- PÓS-CHECK: SELECT id, anexo1, obs1 FROM req_cotacao LIMIT 1;
