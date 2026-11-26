-- Recebimentos: tipo "frete" (CT-e). 26/11/2026
-- O portal já classifica todo CT-e (chave modelo 57) como Frete sem esta migration;
-- ela só libera (1) escolher "Frete (CT-e)" à mão no tipo e (2) cadastrar um
-- responsável próprio para o frete. Sem responsável de frete, o CT-e continua
-- com o responsável de Peças.
ALTER TABLE recebimento_meta DROP CONSTRAINT IF EXISTS recebimento_meta_tipo_check;
ALTER TABLE recebimento_meta ADD CONSTRAINT recebimento_meta_tipo_check
  CHECK (tipo IN ('almoxarifado','combustivel','maquinas','pecas','pecas_garantia','frete'));

ALTER TABLE recebimento_tipo_responsavel DROP CONSTRAINT IF EXISTS recebimento_tipo_responsavel_tipo_check;
ALTER TABLE recebimento_tipo_responsavel ADD CONSTRAINT recebimento_tipo_responsavel_tipo_check
  CHECK (tipo IN ('almoxarifado','combustivel','maquinas','pecas','pecas_garantia','frete'));
