-- =============================================================================
-- INTELIGÊNCIA DE VENDAS — feed do vendedor no app de vendas (20/10/2026)
--
--   iv_feed_pool ........ a reserva de contatos de cada vendedor (carteira, recuperar,
--                         novos), com cidade e posição. O PORTAL grava (robô, service
--                         role); o APP de vendas lê e monta a rota.
--   iv_perfil_vendedor .. o resultado do teste de perfil feito no app (respostas, perfil
--                         e a mistura: quanto de carteira, recuperar e clientes novos).
--
-- O app de vendas usa o login dos vendedores neste mesmo Supabase (role authenticated),
-- com o mesmo padrão permissivo das tabelas dele (visitas, negocios, vendedor_cidades).
-- Idempotente. APLICAR À MÃO no SQL Editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.iv_feed_pool (
  vendedor_id  bigint PRIMARY KEY,
  gerado_em    timestamptz NOT NULL DEFAULT now(),
  cidades      text[] NOT NULL DEFAULT '{}',
  itens        jsonb NOT NULL DEFAULT '[]'::jsonb   -- [{id,tipo,titulo,sub,cidade,porque,acao,selo,peso,lat,lng,aprox,propriedadeId,telefone}]
);

CREATE TABLE IF NOT EXISTS public.iv_perfil_vendedor (
  vendedor_id  bigint PRIMARY KEY,
  respostas    jsonb NOT NULL DEFAULT '[]'::jsonb,
  pontos       jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {conquista, relacionamento, negociacao}
  perfil       text NOT NULL,                       -- conquistador | relacionamento | negociador | equilibrado
  mix          jsonb NOT NULL,                      -- {carteira: 0.4, recuperar: 0.35, novos: 0.25}
  feito_em     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.iv_feed_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iv_perfil_vendedor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iv_feed_pool_select ON public.iv_feed_pool;
CREATE POLICY iv_feed_pool_select ON public.iv_feed_pool FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS iv_perfil_vendedor_select ON public.iv_perfil_vendedor;
CREATE POLICY iv_perfil_vendedor_select ON public.iv_perfil_vendedor FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS iv_perfil_vendedor_write ON public.iv_perfil_vendedor;
CREATE POLICY iv_perfil_vendedor_write ON public.iv_perfil_vendedor FOR ALL TO authenticated USING (true) WITH CHECK (true);

REVOKE ALL ON public.iv_feed_pool, public.iv_perfil_vendedor FROM anon;

NOTIFY pgrst, 'reload schema';
