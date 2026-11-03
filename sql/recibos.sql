-- Recibos de pagamento (José, 03/11/2026) — Financeiro → Recibos.
-- Projeto Supabase do PORTAL (citrhumdk…). Rodar uma vez.
--
-- tipo 'recebemos': a empresa recebeu de alguém (cliente pagou no balcão) e entrega o recibo.
-- tipo 'pagamos'  : a empresa pagou alguém (frete, diarista, serviço avulso) e a pessoa assina o recibo.
-- O token vai no QR do PDF e abre /r/<token> (página pública que confere se o recibo é verdadeiro).
-- Só o servidor (service role) lê e grava: RLS ligado e nenhuma política para anon/authenticated.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.recibos (
  id            bigserial PRIMARY KEY,
  numero        integer NOT NULL,
  empresa       text NOT NULL DEFAULT 'Nova Tratores',
  tipo          text NOT NULL CHECK (tipo IN ('recebemos', 'pagamos')),
  pessoa_nome   text NOT NULL,
  pessoa_doc    text,
  valor         numeric(14, 2) NOT NULL CHECK (valor > 0),
  referente     text NOT NULL,
  forma         text NOT NULL,
  data_pagto    date NOT NULL,
  cidade        text NOT NULL DEFAULT 'Piraju - SP',
  observacao    text,
  origem_tipo   text,             -- 'os' | 'ppv' | null
  origem_id     text,
  token         text NOT NULL UNIQUE,
  emitido_por   uuid,
  emitido_nome  text,
  assina_nome   text,             -- quem assina pela empresa (tipo 'recebemos')
  com_assinatura boolean NOT NULL DEFAULT true,
  cancelado_em  timestamptz,
  cancelado_por text,
  cancelado_motivo text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa, numero)
);

CREATE INDEX IF NOT EXISTS recibos_criado_idx ON public.recibos (criado_em DESC);
CREATE INDEX IF NOT EXISTS recibos_origem_idx ON public.recibos (origem_tipo, origem_id);

ALTER TABLE public.recibos ENABLE ROW LEVEL SECURITY;

-- Próximo número por empresa, sem corrida entre dois cliques ao mesmo tempo.
CREATE OR REPLACE FUNCTION public.recibo_proximo_numero(p_empresa text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('recibos:' || p_empresa));
  SELECT COALESCE(MAX(numero), 0) + 1 INTO n FROM public.recibos WHERE empresa = p_empresa;
  RETURN n;
END $$;

-- Grava o recibo já com o número, numa transação só.
CREATE OR REPLACE FUNCTION public.recibo_emitir(p jsonb)
RETURNS public.recibos LANGUAGE plpgsql AS $$
DECLARE r public.recibos;
BEGIN
  INSERT INTO public.recibos (numero, empresa, tipo, pessoa_nome, pessoa_doc, valor, referente, forma, data_pagto,
    cidade, observacao, origem_tipo, origem_id, token, emitido_por, emitido_nome, assina_nome, com_assinatura)
  VALUES (public.recibo_proximo_numero(p->>'empresa'), p->>'empresa', p->>'tipo', p->>'pessoa_nome', p->>'pessoa_doc',
    (p->>'valor')::numeric, p->>'referente', p->>'forma', (p->>'data_pagto')::date, p->>'cidade', p->>'observacao',
    p->>'origem_tipo', p->>'origem_id', p->>'token', NULLIF(p->>'emitido_por', '')::uuid, p->>'emitido_nome',
    p->>'assina_nome', COALESCE((p->>'com_assinatura')::boolean, true))
  RETURNING * INTO r;
  RETURN r;
END $$;

REVOKE ALL ON FUNCTION public.recibo_proximo_numero(text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.recibo_emitir(jsonb) FROM anon, authenticated;
