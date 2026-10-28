-- Configurações do Centro do Pós-Vendas (José, 20/10/2026): regras editáveis da comissão dos técnicos
-- (valores fixos e o que não paga). Chave/valor. Enquanto esta tabela não existir, o portal grava em
-- iv_config com a chave "posvendas:regras-comissao" — rodar isto só deixa no lugar certo.
CREATE TABLE IF NOT EXISTS public.posvendas_config (
  chave          text PRIMARY KEY,
  valor          jsonb NOT NULL,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_por text
);
ALTER TABLE public.posvendas_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.posvendas_config FROM anon, authenticated;
-- traz o que já foi gravado no lugar provisório
INSERT INTO public.posvendas_config (chave, valor, atualizado_em, atualizado_por)
SELECT 'regras-comissao', valor, atualizado_em, atualizado_por FROM public.iv_config WHERE chave = 'posvendas:regras-comissao'
ON CONFLICT (chave) DO NOTHING;
