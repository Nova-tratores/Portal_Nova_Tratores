-- Assinatura HMAC (tamper-evidence) das correcoes de estoque negativo / CMC.
-- Cada correcao aplicada passa a gravar uma assinatura HMAC-SHA256 dos campos-chave
-- (payload canonico) para provar depois que a linha nao foi adulterada.
--   assinatura        = HMAC-SHA256(JSON(assinatura_payload), CMC_HMAC_SECRET) em hex
--   assinatura_payload = o objeto exato que foi assinado (para reverificar)
-- Verificacao futura: recomputar o HMAC sobre assinatura_payload com o segredo do
-- servidor (env CMC_HMAC_SECRET) e comparar com a coluna assinatura.
ALTER TABLE cmc_correcoes ADD COLUMN IF NOT EXISTS assinatura TEXT;
ALTER TABLE cmc_correcoes ADD COLUMN IF NOT EXISTS assinatura_payload JSONB;
