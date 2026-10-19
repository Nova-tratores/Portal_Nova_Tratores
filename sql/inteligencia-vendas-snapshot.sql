-- =============================================================================
-- INTELIGÊNCIA DE VENDAS — resultados prontos no banco (19/10/2026)
-- José: "não pode demorar, tem que ficar salvando no banco". O cálculo dos clientes
-- (~13 s) e das outras telas pesadas fica guardado aqui, compactado (gzip + base64).
-- A tela lê na hora; quando passa de 30 min, recalcula por trás. Um robô no servidor
-- recalcula a base a cada 20 min. RLS ligado e NENHUMA policy: só a API (service role).
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.iv_snapshot (
  chave       text PRIMARY KEY,          -- 'base', 'equipe', 'municipios:0', 'retorno:15', 'concorrencia-perdas'
  dados       text NOT NULL,             -- JSON compactado (gzip) em base64
  gerado_em   timestamptz NOT NULL DEFAULT now(),
  duracao_ms  integer                    -- quanto o cálculo levou
);
ALTER TABLE public.iv_snapshot ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.iv_snapshot FROM anon, authenticated;
NOTIFY pgrst, 'reload schema';
