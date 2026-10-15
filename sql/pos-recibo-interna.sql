-- OS interna faturada com RECIBO no Omie (José, 15/10/2026): guarda o nº do recibo.
-- Sem esta coluna o faturamento funciona igual; só o nº do recibo não aparece no portal.
ALTER TABLE "Ordem_Servico" ADD COLUMN IF NOT EXISTS recibo_numero text;
NOTIFY pgrst, 'reload schema';
