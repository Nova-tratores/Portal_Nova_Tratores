-- Alimentação na OS: de 1 valor único para VÁRIAS alimentações (sem limite).
-- Cada item: { data, valor, tecnicos: [1 ou 2 nomes], no_pdf }.
-- As colunas antigas (Alimentacao_Tecnico/Valor/No_PDF) seguem como agregado p/ compat.
ALTER TABLE "Ordem_Servico"
  ADD COLUMN IF NOT EXISTS "Alimentacoes" JSONB DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
