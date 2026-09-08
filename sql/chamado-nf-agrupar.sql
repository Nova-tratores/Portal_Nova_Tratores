-- Agrupamento de cards de cobrança (Chamado_NF): juntar 2+ cards do mesmo
-- cliente num card principal (NFs e valor somados, um boleto pra todas).
-- Filho: grupo_pai_id aponta pro principal; grupo_valor_original guarda o
-- valor que ele tinha antes de juntar (o valor migra pro pai e o filho zera).
-- Rodar no SQL Editor do Supabase ANTES de subir o código.

ALTER TABLE "Chamado_NF" ADD COLUMN IF NOT EXISTS grupo_pai_id BIGINT;
ALTER TABLE "Chamado_NF" ADD COLUMN IF NOT EXISTS grupo_valor_original NUMERIC;

CREATE INDEX IF NOT EXISTS idx_chamado_nf_grupo_pai_id
  ON "Chamado_NF" (grupo_pai_id)
  WHERE grupo_pai_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
