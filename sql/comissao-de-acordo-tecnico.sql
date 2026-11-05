-- De acordo do técnico na comissão autorizada (05/11/2026): depois que o diretor autoriza, o gestor do pós-vendas
-- imprime o documento, o técnico confere e assina "de acordo" — no papel (a folha assinada é fotografada e anexada)
-- ou na tela do portal. Se o técnico não concordar, fica registrado o motivo.
-- Depende de sql/diretor-comissoes.sql. Pode rodar de novo sem problema.

ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS ciencia_status text;            -- null = falta · de_acordo · contestou
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS ciencia_forma text;             -- papel · tela
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS ciencia_em timestamptz;
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS ciencia_nome text;              -- nome de quem assinou (o técnico)
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS ciencia_registrada_por text;    -- quem registrou no portal
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS ciencia_registrada_por_id uuid;
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS ciencia_assinatura text;        -- PNG (data URL) quando assinou na tela
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS ciencia_meta jsonb;             -- {ip, ua, em}
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS ciencia_arquivo text;           -- caminho no bucket comissoes-termos
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS ciencia_arquivo_nome text;
ALTER TABLE public.posvendas_comissoes ADD COLUMN IF NOT EXISTS ciencia_motivo text;            -- por que não concordou
ALTER TABLE public.posvendas_comissoes DROP CONSTRAINT IF EXISTS posvendas_comissoes_ciencia_check;
ALTER TABLE public.posvendas_comissoes ADD CONSTRAINT posvendas_comissoes_ciencia_check CHECK (
  ciencia_status IS NULL
  OR (ciencia_status = 'de_acordo' AND ciencia_forma IN ('papel', 'tela') AND ciencia_em IS NOT NULL
      AND (ciencia_forma <> 'papel' OR ciencia_arquivo IS NOT NULL)
      AND (ciencia_forma <> 'tela' OR ciencia_assinatura IS NOT NULL))
  OR (ciencia_status = 'contestou' AND ciencia_em IS NOT NULL AND coalesce(trim(ciencia_motivo), '') <> '')
);

-- histórico: dois tipos novos (mantém os de antes)
ALTER TABLE public.posvendas_comissoes_eventos DROP CONSTRAINT IF EXISTS posvendas_comissoes_eventos_tipo_check;
ALTER TABLE public.posvendas_comissoes_eventos ADD CONSTRAINT posvendas_comissoes_eventos_tipo_check
  CHECK (tipo IN ('pedido', 'devolvida', 'autorizada', 'espelhada', 'erro_rh', 'substituida', 'de_acordo', 'contestada'));

-- folha assinada: bucket PRIVADO, sem policy (o portal entrega por URL assinada)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('comissoes-termos', 'comissoes-termos', false, 15728640, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

NOTIFY pgrst, 'reload schema';

-- PÓS-CHECK
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'posvendas_comissoes' AND column_name LIKE 'ciencia%';  -- 11
--   SELECT id, public FROM storage.buckets WHERE id = 'comissoes-termos';                                                          -- public = false
