-- =============================================================================
-- Marca quando uma garantia aprovada teve a OS faturada no Omie no padrão
-- de garantia (sem gerar conta a receber, categoria #Serv Prest Garantia,
-- conta INTERNO, projeto {montadora}-pgo).
--
-- Usado pra evitar reprocessamento se o garantista clicar aprovar de novo.
-- =============================================================================

ALTER TABLE garantias
  ADD COLUMN IF NOT EXISTS omie_os_garantia_faturada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS omie_os_garantia_erro        TEXT;
