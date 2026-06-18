-- Anexo manual do PDF da OS e do PV (o Omie não fornece o documento por API).
ALTER TABLE portal_nt_clientes_os ADD COLUMN IF NOT EXISTS pdf_anexo TEXT;
ALTER TABLE portal_nt_clientes_pv ADD COLUMN IF NOT EXISTS pdf_anexo TEXT;

NOTIFY pgrst, 'reload schema';
