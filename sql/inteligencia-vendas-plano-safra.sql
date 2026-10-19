-- =============================================================================
-- INTELIGÊNCIA DE VENDAS — Plano Safra semiautomático (19/10/2026)
--
--   iv_linhas_credito .. condições de cada linha (Moderfrota, Pronamp, Inovagro…)
--                        status: 'vigente' (vale hoje) · 'proposta' (o robô leu
--                        uma mudança e espera alguém conferir) · 'antiga'
--   iv_fontes_monitor .. páginas oficiais vigiadas (hash do trecho das condições)
--   iv_config .......... configurações do módulo; aqui: quem confere o Plano Safra
--
-- O robô lê as páginas, e se o trecho das condições mudou, a IA propõe os números
-- novos e avisa no sino quem confere. Nada vira "vigente" sem uma pessoa aprovar.
-- RLS ligado e NENHUMA policy: só a API (service role). APLICAR À MÃO no SQL Editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.iv_linhas_credito (
  id                bigserial PRIMARY KEY,
  programa          text NOT NULL,             -- 'moderfrota' | 'pronamp' | 'pronaf' | 'inovagro' | outro
  nome              text NOT NULL,             -- ex.: "Moderfrota — receita bruta até R$ 45 milhões"
  safra             text,                      -- ex.: '2026/27'
  taxa_aa           numeric(6,2),              -- % ao ano (a menor da faixa)
  taxa_aa_max       numeric(6,2),              -- % ao ano (a maior, quando é faixa)
  prazo_anos        numeric(5,1),
  carencia_meses    integer,
  participacao_pct  numeric(5,1),              -- quanto do valor o banco financia
  limite            text,
  publico           text,                      -- para quem vale
  financia          text,                      -- o que pode financiar
  fonte_url         text,
  observacao        text,
  status            text NOT NULL DEFAULT 'proposta' CHECK (status IN ('vigente','proposta','antiga','rejeitada')),
  proposta_de       bigint REFERENCES public.iv_linhas_credito(id) ON DELETE SET NULL,
  origem            text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','robo')),
  criado_em         timestamptz NOT NULL DEFAULT now(),
  criado_por        text,
  conferido_em      timestamptz,
  conferido_por     text
);
CREATE INDEX IF NOT EXISTS iv_linhas_credito_status_idx ON public.iv_linhas_credito (status, programa);

CREATE TABLE IF NOT EXISTS public.iv_fontes_monitor (
  id             bigserial PRIMARY KEY,
  programa       text NOT NULL,
  nome           text NOT NULL,
  url            text NOT NULL UNIQUE,
  hash           text,
  trecho         text,                         -- o texto das condições lido da última vez
  verificado_em  timestamptz,
  mudou_em       timestamptz,
  erro           text
);

CREATE TABLE IF NOT EXISTS public.iv_config (
  chave          text PRIMARY KEY,
  valor          jsonb NOT NULL,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_por text
);

ALTER TABLE public.iv_linhas_credito ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iv_fontes_monitor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iv_config         ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.iv_linhas_credito, public.iv_fontes_monitor, public.iv_config FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
