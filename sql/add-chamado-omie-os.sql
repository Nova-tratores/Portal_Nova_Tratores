-- Vínculo do Chamado_NF com a Ordem de Serviço do Omie (idempotência do sync Oficina)
ALTER TABLE "Chamado_NF" ADD COLUMN IF NOT EXISTS omie_num_os TEXT;

-- 1 chamado por OS/empresa
CREATE UNIQUE INDEX IF NOT EXISTS chamado_nf_omie_os_uidx
  ON "Chamado_NF" (omie_num_os, omie_empresa)
  WHERE omie_num_os IS NOT NULL;

NOTIFY pgrst, 'reload schema';
