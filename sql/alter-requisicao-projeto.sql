-- Requisição: vínculo com projeto (usado no card de requisição e no "achada pelo chassi" das Pastas Clientes).
ALTER TABLE "Requisicao" ADD COLUMN IF NOT EXISTS "projeto_codigo" TEXT;
ALTER TABLE "Requisicao" ADD COLUMN IF NOT EXISTS "projeto_nome" TEXT;

NOTIFY pgrst, 'reload schema';
