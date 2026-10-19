-- =============================================================================
-- INTELIGÊNCIA DE VENDAS — Boletim do agro (notícias diárias) — 19/10/2026
--
--   iv_boletim ... um por dia: manchete, indicadores (dólar, Selic, preços CONAB),
--                  previsões (Focus + clima), quais fontes responderam e os erros
--   iv_noticias .. as notícias do dia, cada uma com o LINK DA FONTE (unique por dia)
--
-- O robô (src/lib/inteligencia-vendas/noticias-server.ts) roda 1x por dia ~06:30
-- BRT. RLS ligado e NENHUMA policy: só a API (service role). Idempotente.
-- APLICAR À MÃO no SQL Editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.iv_boletim (
  dia         date PRIMARY KEY,
  manchete    jsonb,                                   -- {titulo, resumo}
  indicadores jsonb NOT NULL DEFAULT '[]'::jsonb,      -- [{id,nome,valor,texto,variacaoPct,tendencia,referencia,fonte_nome,fonte_url}]
  previsoes   jsonb NOT NULL DEFAULT '{}'::jsonb,      -- {focus:[...], clima:[...]}
  gerado_em   timestamptz NOT NULL DEFAULT now(),
  fontes      jsonb NOT NULL DEFAULT '{}'::jsonb,      -- {"nome da fonte": "ok" | "erro"}
  erros       jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS public.iv_noticias (
  id            bigserial PRIMARY KEY,
  dia           date NOT NULL,
  categoria     text NOT NULL,                         -- taxas | mercado | regiao | clima | credito | maquinas | politica
  tendencia     text NOT NULL DEFAULT 'neutra' CHECK (tendencia IN ('boa','ruim','neutra')),
  titulo        text NOT NULL,
  resumo        text,
  impacto       text,                                  -- o que muda para quem vende trator na região
  fonte_nome    text,
  fonte_url     text NOT NULL,
  publicado_em  timestamptz,
  destaque      boolean NOT NULL DEFAULT false,
  cidades       text[] NOT NULL DEFAULT '{}',
  criado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dia, fonte_url)
);
CREATE INDEX IF NOT EXISTS iv_noticias_dia_idx ON public.iv_noticias (dia DESC, destaque DESC);

ALTER TABLE public.iv_boletim  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iv_noticias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.iv_boletim, public.iv_noticias FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.iv_noticias_id_seq FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- 19/10/2026 (2ª parte): foto e texto da matéria para o modal da notícia
ALTER TABLE public.iv_noticias ADD COLUMN IF NOT EXISTS imagem_url text;
ALTER TABLE public.iv_noticias ADD COLUMN IF NOT EXISTS url_artigo text;   -- link real (o do Google Notícias é redirecionamento)
ALTER TABLE public.iv_noticias ADD COLUMN IF NOT EXISTS corpo jsonb;       -- parágrafos da matéria
NOTIFY pgrst, 'reload schema';
