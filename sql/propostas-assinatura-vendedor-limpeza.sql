-- =====================================================================
-- Nova Tratores — /propostas: limpeza das colunas de IMAGEM de assinatura
-- Data: 2026-09-14  ·  OPCIONAL — NÃO APLICADA (rodar só se quiser)
--
-- Decisão de 14/09/2026: o bloco de assinatura do PDF da proposta é só
-- texto (linha + carimbo do vendedor). Nenhum código lê mais:
--   vendedores.assinatura_url      (criada em propostas-assinatura-vendedor.sql,
--                                   nunca chegou a ser usada em produção)
--   "Configuracoes".assinatura_url (a imagem antiga "Assinatura Fernando.png")
--
-- Deixar as colunas não quebra nada; esta migration só evita lixo no schema.
-- O arquivo equipamentos/Assinatura Fernando.png e equipamentos/assinaturas/15.png
-- (teste) podem ser apagados no Storage à mão.
-- =====================================================================

BEGIN;

ALTER TABLE vendedores      DROP COLUMN IF EXISTS assinatura_url;
ALTER TABLE "Configuracoes" DROP COLUMN IF EXISTS assinatura_url;

NOTIFY pgrst, 'reload schema';

COMMIT;
