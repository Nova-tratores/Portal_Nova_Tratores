-- =============================================================================
-- Endereço do fornecedor (Estado/UF e Cidade).
-- O Omie exige ao menos o Estado ao cadastrar um fornecedor novo via IncluirCliente.
-- Ficam no cadastro do fornecedor e são reaproveitados em todo envio ao Omie.
-- Registros antigos ficam NULL — preencher no cadastro quando for enviar ao Omie.
-- =============================================================================

ALTER TABLE "Fornecedores"
  ADD COLUMN IF NOT EXISTS estado TEXT,
  ADD COLUMN IF NOT EXISTS cidade TEXT;
