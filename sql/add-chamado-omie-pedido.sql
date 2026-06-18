-- Vínculo do Chamado_NF com o Pedido de Venda do Omie (idempotência do sync de Peças)
ALTER TABLE "Chamado_NF" ADD COLUMN IF NOT EXISTS omie_num_pedido TEXT;
ALTER TABLE "Chamado_NF" ADD COLUMN IF NOT EXISTS omie_empresa TEXT;
ALTER TABLE "Chamado_NF" ADD COLUMN IF NOT EXISTS origem TEXT;      -- 'omie_pecas' quando criado pelo sync
ALTER TABLE "Chamado_NF" ADD COLUMN IF NOT EXISTS categoria_nota TEXT; -- 'peças' etc.

-- Evita duplicar o mesmo pedido (1 chamado por pedido/empresa)
CREATE UNIQUE INDEX IF NOT EXISTS chamado_nf_omie_pedido_uidx
  ON "Chamado_NF" (omie_num_pedido, omie_empresa)
  WHERE omie_num_pedido IS NOT NULL;

NOTIFY pgrst, 'reload schema';
