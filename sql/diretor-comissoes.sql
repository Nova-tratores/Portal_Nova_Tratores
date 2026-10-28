-- Diretor + lançamento de comissão pelo portal (José, 20/10/2026: "não quero mais lançar no RH, quero que lance
-- por aqui e espelhe no RH. Antes de lançar temos que pedir autorização para o diretor da empresa").
--  1) papel Diretor (marcado na Administração, como Admin/Dev) — vale para o portal todo;
--  2) posvendas_comissoes: cada pedido (técnico + mês) com TODAS as OS, a assinatura de quem pediu, a decisão do
--     diretor (autoriza assinando, ou devolve com apontamentos sem mudar nada) e o espelho no RH;
--  3) posvendas_comissoes_eventos: o histórico de tudo que aconteceu (aba Histórico).
-- Pode rodar de novo sem problema.

ALTER TABLE public.portal_permissoes ADD COLUMN IF NOT EXISTS is_diretor boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.posvendas_comissoes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tecnico        text NOT NULL,
  mes            text NOT NULL CHECK (mes ~ '^\d{4}-\d{2}$'),
  valor          numeric(12,2) NOT NULL CHECK (valor >= 0),
  calculado      numeric(12,2),
  linhas         jsonb NOT NULL DEFAULT '[]'::jsonb,   -- todas as OS do mês: numero, cliente, grupo, regra, calculado, valor, acao, motivo, divisao
  status         text NOT NULL DEFAULT 'aguardando',
  pedido_por     text,
  pedido_por_id  uuid,
  pedido_em      timestamptz NOT NULL DEFAULT now(),
  decidido_por   text,
  decidido_em    timestamptz,
  observacao     text,
  rh_comissao_id text,
  rh_erro        text,
  espelhado_em   timestamptz
);
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS info jsonb;                     -- nome no RH, cargo, % e pagamento previsto (para o documento)
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS descontos jsonb;                -- descontos do técnico (requisição/outro) → viram rh_descontos
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS apontamentos jsonb;             -- o que o diretor pediu para mudar
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS assinatura_pedido text;          -- PNG (data URL) de quem pediu
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS assinatura_pedido_meta jsonb;    -- {ip, ua, em}
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS assinatura_diretor text;         -- PNG do diretor
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS assinatura_diretor_meta jsonb;
ALTER TABLE public.posvendas_comissoes DROP CONSTRAINT IF EXISTS posvendas_comissoes_status_check;
ALTER TABLE public.posvendas_comissoes ADD CONSTRAINT posvendas_comissoes_status_check
  CHECK (status IN ('aguardando', 'devolvida', 'recusada', 'espelhada', 'erro_rh', 'cancelada', 'substituida'));
-- um pedido em aberto por técnico e mês
CREATE UNIQUE INDEX IF NOT EXISTS posvendas_comissoes_aberto ON public.posvendas_comissoes (tecnico, mes) WHERE status = 'aguardando';
CREATE INDEX IF NOT EXISTS posvendas_comissoes_mes ON public.posvendas_comissoes (mes, status);

CREATE TABLE IF NOT EXISTS public.posvendas_comissoes_eventos (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.posvendas_comissoes(id) ON DELETE CASCADE,
  tecnico   text NOT NULL,
  mes       text NOT NULL,
  tipo      text NOT NULL CHECK (tipo IN ('pedido', 'devolvida', 'autorizada', 'espelhada', 'erro_rh', 'substituida')),
  autor     text,
  autor_id  uuid,
  em        timestamptz NOT NULL DEFAULT now(),
  valor     numeric(12,2),
  detalhes  jsonb
);
CREATE INDEX IF NOT EXISTS posvendas_comissoes_eventos_em ON public.posvendas_comissoes_eventos (em DESC);
CREATE INDEX IF NOT EXISTS posvendas_comissoes_eventos_tm ON public.posvendas_comissoes_eventos (tecnico, mes);

ALTER TABLE public.posvendas_comissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posvendas_comissoes_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.posvendas_comissoes FROM anon, authenticated;
REVOKE ALL ON public.posvendas_comissoes_eventos FROM anon, authenticated;
NOTIFY pgrst, 'reload schema';
