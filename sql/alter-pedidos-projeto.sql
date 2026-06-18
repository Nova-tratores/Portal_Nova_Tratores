-- PPV: campo de projeto (copiado da OS vinculada e enviado ao Omie).
ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "Projeto" TEXT DEFAULT '';

NOTIFY pgrst, 'reload schema';
