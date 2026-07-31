-- ============================================================
-- Propostas: nova classe AUTOPROPELIDO (pulverizador autopropelido)
-- Espelha o padrao do TRATOR (catalogo cad_* + colunas na Formulario).
-- ============================================================

-- 1) Coluna que passa a GUARDAR o tipo da proposta.
--    Ate hoje o tipo era "adivinhado" pelos campos preenchidos. Com o
--    autopropelido (que tambem tem MOTOR) isso deixa de ser confiavel.
--    Propostas antigas ficam com tipo NULL e continuam caindo no palpite.
ALTER TABLE "Formulario" ADD COLUMN IF NOT EXISTS "tipo" text;

-- 2) Colunas de especificacao do autopropelido na propria proposta.
--    Sufixo _auto para nao colidir com os campos _trator.
ALTER TABLE "Formulario" ADD COLUMN IF NOT EXISTS "motor_auto" text;
ALTER TABLE "Formulario" ADD COLUMN IF NOT EXISTS "transmissao_auto" text;
ALTER TABLE "Formulario" ADD COLUMN IF NOT EXISTS "tanque_pulv_auto" text;
ALTER TABLE "Formulario" ADD COLUMN IF NOT EXISTS "tecnologia_auto" text;
ALTER TABLE "Formulario" ADD COLUMN IF NOT EXISTS "telemetria_auto" text;
ALTER TABLE "Formulario" ADD COLUMN IF NOT EXISTS "barra_pulv_auto" text;
ALTER TABLE "Formulario" ADD COLUMN IF NOT EXISTS "num_secoes_auto" text;
ALTER TABLE "Formulario" ADD COLUMN IF NOT EXISTS "espac_bicos_auto" text;
ALTER TABLE "Formulario" ADD COLUMN IF NOT EXISTS "vao_livre_auto" text;
ALTER TABLE "Formulario" ADD COLUMN IF NOT EXISTS "bitola_auto" text;
ALTER TABLE "Formulario" ADD COLUMN IF NOT EXISTS "tanque_comb_auto" text;

-- 3) Catalogo de modelos de autopropelido (equivalente ao cad_trator).
CREATE TABLE IF NOT EXISTS "cad_autopropelido" (
  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "created_at" timestamptz DEFAULT now(),
  "marca" text,
  "modelo" text,
  "ano" text,
  "finame/ncm" text,
  "imagem" text,
  "motor" text,
  "transmissao" text,
  "tanque_pulv" text,
  "tecnologia" text,
  "telemetria" text,
  "barra_pulv" text,
  "num_secoes" text,
  "espac_bicos" text,
  "vao_livre" text,
  "bitola" text,
  "tanque_comb" text
);
