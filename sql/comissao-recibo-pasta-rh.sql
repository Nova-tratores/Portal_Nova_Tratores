-- Recibo da comissão + pasta do funcionário no RH (05/11/2026). Complementa sql/comissao-de-acordo-tecnico.sql.
-- Depois de autorizada, saem DOIS documentos para o técnico assinar: o de acordo (já existia) e o RECIBO (declara
-- que recebeu o valor). Assinados, são escaneados e anexados: ficam no portal e vão para a aba Documentos do
-- funcionário no sistema do RH (rh_documentos). A folha física vai para a pasta dele.
-- Pode rodar de novo sem problema.

ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS recibo_em timestamptz;              -- quando o recibo assinado foi anexado
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS recibo_arquivo text;                -- caminho no bucket comissoes-termos
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS recibo_arquivo_nome text;
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS recibo_registrado_por text;
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS recibo_registrado_por_id uuid;
-- cópia na pasta do funcionário (sistema do RH): id do rh_documentos ou o erro, para tentar de novo
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS ciencia_rh_doc_id text;
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS ciencia_rh_erro text;
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS recibo_rh_doc_id text;
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS recibo_rh_erro text;

ALTER TABLE public.posvendas_comissoes_eventos DROP CONSTRAINT IF EXISTS posvendas_comissoes_eventos_tipo_check;
ALTER TABLE public.posvendas_comissoes_eventos ADD CONSTRAINT posvendas_comissoes_eventos_tipo_check
  CHECK (tipo IN ('pedido', 'devolvida', 'autorizada', 'espelhada', 'erro_rh', 'substituida', 'de_acordo', 'contestada', 'recibo'));

NOTIFY pgrst, 'reload schema';

-- PÓS-CHECK
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'posvendas_comissoes' AND (column_name LIKE 'recibo%' OR column_name LIKE '%rh_doc_id' OR column_name LIKE '%rh_erro' AND column_name <> 'rh_erro');  -- 9
