-- =============================================================================
-- E-mail do fornecedor.
-- O Omie exige o e-mail ao cadastrar um fornecedor novo via IncluirCliente.
-- Fica no cadastro do fornecedor e é reaproveitado em todo envio ao Omie.
-- Registros antigos ficam NULL — preencher no cadastro quando for enviar ao Omie.
-- =============================================================================

ALTER TABLE "Fornecedores"
  ADD COLUMN IF NOT EXISTS email TEXT;
