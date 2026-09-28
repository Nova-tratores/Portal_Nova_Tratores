-- =====================================================================
-- SOLICITAÇÃO DE COMPRAS (SC — tipo='compras') — v2 do motor de tickets
-- Portal Nova Tratores. APLICAR À MÃO no SQL Editor do Supabase.
--
-- Conceito: ADRs 005–007. A SC é um TIPO de ticket com trilho de alçadas
-- (vendedor → diretoria → financeiro → comprador), por cima do mesmo motor
-- da v1: timeline append-only (o "livro de decisões"), participantes
-- permanentes, notificações. NÃO é um sistema paralelo.
--
-- O que esta migration adiciona:
--   1) coluna `tickets.sc_etapa` (máquina de estados do trilho; NULL p/ os demais tipos)
--   2) `tickets_compras_config`: singleton com as pessoas fixas por etapa
--      (UMA por etapa) + limiares do aviso de bloqueio (valor / excesso de estoque)
--
-- O que ela NÃO faz, de propósito: NÃO recria o CHECK de `tickets_eventos.tipo`.
-- Os eventos da SC (sc_criada, qtd_alterada, parecer_financeiro, pc_emitido) já
-- entraram na lista por sql/tickets-vinculos.sql e sql/create-war-room.sql.
-- Recriar aqui com a lista de julho derrubaria `vinculo_*` e `wr_*`.
-- O bloco 3 só CONFERE e avisa se faltar algum.
--
-- Escrita continua SÓ via /api/tickets/* (service role): sem policies de
-- INSERT/UPDATE/DELETE. A config tem apenas SELECT para authenticated (a UI
-- precisa saber "sou eu o financeiro?" para mostrar o painel certo).
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Etapa do trilho da SC
-- ---------------------------------------------------------------------
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS sc_etapa TEXT;

ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_sc_etapa_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_sc_etapa_check
  CHECK (sc_etapa IS NULL OR sc_etapa IN (
    'vendedor', 'diretoria', 'financeiro', 'comprador', 'concluida', 'cancelada'
  ));

CREATE INDEX IF NOT EXISTS idx_tickets_sc_etapa ON public.tickets(sc_etapa) WHERE tipo = 'compras';

-- ---------------------------------------------------------------------
-- 2) Config da SC: pessoas fixas por etapa + limiares. Linha única.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tickets_compras_config (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),   -- garante no máximo 1 linha
  diretoria_id UUID REFERENCES auth.users(id),
  financeiro_id UUID REFERENCES auth.users(id),
  comprador_id UUID REFERENCES auth.users(id),
  valor_limite_bloqueio NUMERIC,                    -- NULL = sem aviso por valor
  qtd_excesso_estoque   NUMERIC,                    -- NULL = sem aviso por estoque
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tickets_compras_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tickets_compras_config_select ON public.tickets_compras_config;
CREATE POLICY tickets_compras_config_select ON public.tickets_compras_config
  FOR SELECT TO authenticated
  USING (true);

REVOKE ALL ON public.tickets_compras_config FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.tickets_compras_config FROM authenticated;

-- ---------------------------------------------------------------------
-- 3) Conferência: o CHECK de eventos aceita os tipos da SC?
--    Se aparecer WARNING, NÃO usar a SC antes de incluir os tipos que faltam
--    no CHECK (mantendo TODOS os que já estão lá).
-- ---------------------------------------------------------------------
DO $$
DECLARE
  def text;
  t text;
BEGIN
  SELECT string_agg(pg_get_constraintdef(oid), ' ') INTO def
    FROM pg_constraint
   WHERE conrelid = 'public.tickets_eventos'::regclass AND contype = 'c';
  FOREACH t IN ARRAY ARRAY['sc_criada', 'qtd_alterada', 'parecer_financeiro', 'pc_emitido'] LOOP
    IF def IS NULL OR position('''' || t || '''' IN def) = 0 THEN
      RAISE WARNING 'tickets_eventos: o CHECK de tipo NAO aceita "%"', t;
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- PÓS-CHECK
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'tickets' AND column_name = 'sc_etapa';          -- 1 linha
--   SELECT count(*) FROM public.tickets_compras_config;                  -- 0 (a tela de config cria)
