-- OS do portal no formato da OS do Omie (José, 13/10/2026).
-- O que o Omie tem e o portal não tinha (departamentos, informações adicionais,
-- parcelas, e-mail, serviços incluídos, "não cobrar" de hora/km) fica num jsonb.
-- Sem esta coluna o portal funciona igual, só não guarda essas abas.
ALTER TABLE "Ordem_Servico" ADD COLUMN IF NOT EXISTS "Omie_Espelho" jsonb;
NOTIFY pgrst, 'reload schema';
