-- =====================================================================
-- SOLICITAÇÃO DE COMPRAS — 2ª pessoa da Diretoria (05/11/2026)
-- Decisão do José: a Diretoria de Compras é a Pollyane E o Dougras.
-- A config tinha UMA pessoa por etapa; esta migration adiciona a 2ª pessoa
-- da Diretoria. As duas decidem igual (alterar quantidade / devolver); a
-- solicitação nova fica com a 1ª ("bola") e a 2ª entra como participante
-- e é avisada. Financeiro e Comprador seguem com uma pessoa só.
-- APLICAR À MÃO no SQL Editor. Idempotente.
-- =====================================================================

ALTER TABLE public.tickets_compras_config
  ADD COLUMN IF NOT EXISTS diretoria2_id UUID REFERENCES auth.users(id);

ALTER TABLE public.tickets_compras_config DROP CONSTRAINT IF EXISTS tickets_compras_config_diretoria2_diferente;
ALTER TABLE public.tickets_compras_config ADD CONSTRAINT tickets_compras_config_diretoria2_diferente
  CHECK (diretoria2_id IS NULL OR diretoria2_id <> diretoria_id);

-- Designação de 05/11/2026 (ids de financeiro_usu/auth.users):
--   Diretoria 1ª  Pollyane tonon               491456e5-5c89-4c64-ba3e-1fc5ec987bd4 (já estava)
--   Diretoria 2ª  Dougras Mogrs de Jesus Bonfim 1e5da490-e62b-46f4-a527-f977f0ecfee7
--   Financeiro    henri@novatratores.com.br     9bb01b51-56d7-4705-a2fc-053ff69f0561 (já estava)
--   Comprador     Mariano (mariano.novatratores@gmail.com) 3c9d4cc0-3771-4b04-adf1-2b9a2f93ceaa (já estava)
UPDATE public.tickets_compras_config
   SET diretoria_id  = '491456e5-5c89-4c64-ba3e-1fc5ec987bd4',
       diretoria2_id = '1e5da490-e62b-46f4-a527-f977f0ecfee7',
       financeiro_id = '9bb01b51-56d7-4705-a2fc-053ff69f0561',
       comprador_id  = '3c9d4cc0-3771-4b04-adf1-2b9a2f93ceaa',
       atualizado_em = now()
 WHERE id = true;

NOTIFY pgrst, 'reload schema';

-- PÓS-CHECK
--   SELECT diretoria_id, diretoria2_id, financeiro_id, comprador_id FROM public.tickets_compras_config;
