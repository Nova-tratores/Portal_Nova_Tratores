-- =============================================================================
-- POPs — ROTEIROS: checklists em sequência anexados a uma OS (04/11/2026)
-- Caso de origem: trator levado a um evento → saída da loja → chegada no evento
-- → saída do evento → chegada na loja. Cada etapa é uma execução de POP comum
-- (ticket 'pop'); a próxima só é liberada quando a anterior termina.
--
-- Roteiro (modelo) → etapas em ordem, cada uma apontando para um POP.
-- Na OS: cópia das etapas no momento de anexar (mudar o modelo depois não mexe
-- nas OS em andamento). Tudo por /api/* com service role; RLS ligado sem policy.
-- Idempotente. Rollback no fim.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pops_roteiros (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 3 AND 120),
  descricao   text NOT NULL DEFAULT '',
  area_id     uuid NOT NULL REFERENCES public.pops_areas(id),
  ativo       boolean NOT NULL DEFAULT true,
  criado_por  uuid,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pops_roteiro_etapas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roteiro_id  uuid NOT NULL REFERENCES public.pops_roteiros(id) ON DELETE CASCADE,
  ordem       int  NOT NULL CHECK (ordem BETWEEN 1 AND 30),
  nome        text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 2 AND 80),
  pop_id      uuid NOT NULL REFERENCES public.pops(id),
  responsavel_padrao_id uuid,
  prazo_dias  int CHECK (prazo_dias IS NULL OR prazo_dias BETWEEN 0 AND 365),
  UNIQUE (roteiro_id, ordem)
);
CREATE INDEX IF NOT EXISTS pops_roteiro_etapas_pop_idx ON public.pops_roteiro_etapas (pop_id);

CREATE TABLE IF NOT EXISTS public.pops_os_roteiros (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id       text NOT NULL,                       -- Ordem_Servico.Id_Ordem
  roteiro_id  uuid REFERENCES public.pops_roteiros(id) ON DELETE SET NULL,
  nome        text NOT NULL,                       -- snapshot do nome do roteiro
  mkt_acao_id uuid,                                -- evento do Marketing (opcional, sem FK)
  status      text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'concluido', 'cancelado')),
  criado_por  uuid,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pops_os_roteiros_os_idx ON public.pops_os_roteiros (os_id);

CREATE TABLE IF NOT EXISTS public.pops_os_etapas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_roteiro_id  uuid NOT NULL REFERENCES public.pops_os_roteiros(id) ON DELETE CASCADE,
  ordem          int  NOT NULL,
  nome           text NOT NULL,
  pop_id         uuid NOT NULL REFERENCES public.pops(id),
  responsavel_id uuid NOT NULL,
  prazo_dias     int,
  status         text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'liberada', 'concluida', 'pulada')),
  ticket_id      uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  liberada_em    timestamptz,
  concluida_em   timestamptz,
  motivo_pulo    text,
  pulada_por     uuid,
  UNIQUE (os_roteiro_id, ordem),
  CONSTRAINT pops_os_etapas_pulo_com_motivo CHECK (status <> 'pulada' OR char_length(btrim(coalesce(motivo_pulo, ''))) > 0)
);
CREATE INDEX IF NOT EXISTS pops_os_etapas_ticket_idx ON public.pops_os_etapas (ticket_id) WHERE ticket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pops_os_etapas_liberadas_idx ON public.pops_os_etapas (status) WHERE status = 'liberada';

-- Vínculo de verdade execução ↔ OS (o ref_externa "OS-0852 · chassi" continua).
ALTER TABLE public.pops_execucoes ADD COLUMN IF NOT EXISTS os_id text;
CREATE INDEX IF NOT EXISTS pops_execucoes_os_idx ON public.pops_execucoes (os_id) WHERE os_id IS NOT NULL;

-- Liberar a próxima etapa sem corrida: só UMA chamada consegue passar a etapa
-- de 'pendente' para 'liberada' (UPDATE condicional na rota). Nada extra aqui.

ALTER TABLE public.pops_roteiros       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pops_roteiro_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pops_os_roteiros    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pops_os_etapas      ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pops_roteiros, public.pops_roteiro_etapas, public.pops_os_roteiros, public.pops_os_etapas FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- PÓS-CHECK
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('pops_roteiros','pops_roteiro_etapas','pops_os_roteiros','pops_os_etapas');  -- 4 × true
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'pops_execucoes' AND column_name = 'os_id';  -- 1 linha
--
-- ROLLBACK
--   DROP TABLE IF EXISTS public.pops_os_etapas, public.pops_os_roteiros, public.pops_roteiro_etapas, public.pops_roteiros;
--   DROP INDEX IF EXISTS public.pops_execucoes_os_idx;
--   ALTER TABLE public.pops_execucoes DROP COLUMN IF EXISTS os_id;
