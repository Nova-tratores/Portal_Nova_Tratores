-- Marca cada item (movimentação) com o kit de onde veio, para dar pra remover o kit
-- inteiro de uma vez no PPV (ou continuar removendo item a item). Guarda "rótulo§batchId"
-- (rótulo = ex. "Revisão 300H · 6075"; batchId = distingue importações repetidas do mesmo kit).
ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS "Kit" text;
