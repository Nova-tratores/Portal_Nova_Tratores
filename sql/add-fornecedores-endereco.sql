-- =============================================================================
-- Endereço do fornecedor (completo).
-- O Omie exige o endereço inteiro ao cadastrar um fornecedor novo via
-- IncluirCliente: Endereço, Número, Bairro, Cidade, Estado (UF) e CEP.
-- Fica no cadastro do fornecedor e é reaproveitado em todo envio ao Omie.
-- No cadastro, o CEP puxa logradouro/bairro/cidade/UF automaticamente (ViaCEP);
-- só o número é digitado à mão.
-- Idempotente (IF NOT EXISTS) — pode rodar de novo sem problema.
-- Obs.: "numero" já existe e é o TELEFONE do fornecedor; o número do
--        endereço fica em "endereco_numero".
-- =============================================================================

ALTER TABLE "Fornecedores"
  ADD COLUMN IF NOT EXISTS estado          TEXT,
  ADD COLUMN IF NOT EXISTS cidade          TEXT,
  ADD COLUMN IF NOT EXISTS cep             TEXT,
  ADD COLUMN IF NOT EXISTS endereco        TEXT,
  ADD COLUMN IF NOT EXISTS endereco_numero TEXT,
  ADD COLUMN IF NOT EXISTS bairro          TEXT;
