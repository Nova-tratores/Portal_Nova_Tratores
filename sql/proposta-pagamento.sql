-- =============================================================================
-- Pagamento estruturado da Proposta (13/11/2026)
--
-- A Proposta ("Formulario") só tinha "Condicoes" em texto livre. Agora a forma
-- de pagamento (entrada + parcelas, financiamento) mora AQUI, numa tabela à
-- parte, para o Pedido de Máquinas importar.
--
-- ⚠️ NÃO criar coluna em "Formulario": v_formulario é `SELECT f.*` e o Postgres
-- expande o * na criação da view — a coluna nova não apareceria na tela.
--
-- Leitura e escrita só pela API (/api/propostas/[id]/pagamento, service role).
-- Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.proposta_pagamento (
  proposta_id     bigint PRIMARY KEY REFERENCES public."Formulario"(id) ON DELETE CASCADE,
  forma           text NOT NULL DEFAULT 'parcelado'
                  CHECK (forma IN ('avista', 'parcelado', 'financiado', 'misto')),
  entrada_valor   numeric(14,2),
  entrada_data    date,
  -- [{ n, vencimento: 'YYYY-MM-DD', valor, percentual, meio: boleto|cheque|financiamento|pix|outro }]
  parcelas        jsonb NOT NULL DEFAULT '[]'::jsonb,
  banco           text,
  linha_credito   text,
  obs             text,
  atualizado_por  text,
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.proposta_pagamento ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.proposta_pagamento FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
