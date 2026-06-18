-- Ordens internas: garante a coluna e RECARREGA o schema cache do PostgREST.
-- Sem o reload, o select("*") não traz "Servico_Interno" e a marcação "some" ao reabrir.
ALTER TABLE "Ordem_Servico" ADD COLUMN IF NOT EXISTS "Servico_Interno" BOOLEAN DEFAULT false;

-- Garante a função usada pra gravar (idempotente)
CREATE OR REPLACE FUNCTION set_servico_interno(p_id_ordem TEXT, p_valor BOOLEAN)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE "Ordem_Servico" SET "Servico_Interno" = p_valor WHERE "Id_Ordem" = p_id_ordem;
$$;

NOTIFY pgrst, 'reload schema';
