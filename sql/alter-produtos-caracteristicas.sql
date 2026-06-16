-- PPV: só as CARACTERÍSTICAS do produto (campo "caracteristicas" do Omie:
-- #PRATELEIRA, #ANDAR, #CAIXA, Tipo, etc). Cacheadas sob demanda na geração do PDF.

-- Remove as colunas que não vamos usar (caso tenham sido criadas antes)
ALTER TABLE "Produtos_Completos" DROP COLUMN IF EXISTS "NCM";
ALTER TABLE "Produtos_Completos" DROP COLUMN IF EXISTS "Codigo_Barras";
ALTER TABLE "Produtos_Completos" DROP COLUMN IF EXISTS "Unidade";
ALTER TABLE "Produtos_Completos" DROP COLUMN IF EXISTS "Marca";
ALTER TABLE "Produtos_Completos" DROP COLUMN IF EXISTS "Modelo";
ALTER TABLE "Produtos_Completos" DROP COLUMN IF EXISTS "Descricao_Detalhada";
ALTER TABLE "Produtos_Completos" DROP COLUMN IF EXISTS "Familia";
ALTER TABLE "Produtos_Completos" DROP COLUMN IF EXISTS "Estoque";
ALTER TABLE "Produtos_Completos" DROP COLUMN IF EXISTS "Estoque_Minimo";

-- Única coluna nova: características (texto formatado). NULL = ainda não buscado.
ALTER TABLE "Produtos_Completos" ADD COLUMN IF NOT EXISTS "Caracteristicas" TEXT;

NOTIFY pgrst, 'reload schema';
