-- Garantia SÓ DE PEÇAS (sem OS) — 24/11/2026
-- Garantia para a fábrica repor peças (estoque com defeito, tinta, peça de
-- terceiro) sem abrir ordem de serviço. A garantia nasce sem id_ordem.
-- Idempotente. Rodar no SQL Editor ANTES do deploy (sem ela, criar
-- "Só peças" responde 503 com esta mensagem; o resto segue igual).

ALTER TABLE public.garantias ALTER COLUMN id_ordem DROP NOT NULL;

ALTER TABLE public.garantias
  ADD COLUMN IF NOT EXISTS so_pecas boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.garantias.so_pecas IS
  'Garantia só de peças, sem OS (id_ordem nulo). Sem horas/km, sem NFS-e de reembolso.';

-- O índice único de "uma garantia ativa por OS" (uq_garantia_os_ativa) ignora
-- NULL sozinho: várias garantias só de peças podem estar ativas ao mesmo tempo.

NOTIFY pgrst, 'reload schema';
