-- ════════════════════════════════════════════════════════════════════
-- Opa: território (lugar físico) + departamento responsável (04/11/2026)
-- Só ORGANIZAM e FILTRAM — não mudam quem vê (isso é o "Para quem?",
-- sql/opa-publico.sql). Texto livre de propósito: as listas vivem no código
-- (src/app/(portal)/opa/page.tsx — LOCAIS / DEPARTAMENTOS) e podem crescer
-- sem migration. Opas antigos ficam sem (NULL = "não informado").
-- Sem esta migration o Opa cria normal se os dois ficarem em branco.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE portal_opas ADD COLUMN IF NOT EXISTS local TEXT;
ALTER TABLE portal_opas ADD COLUMN IF NOT EXISTS departamento TEXT;

NOTIFY pgrst, 'reload schema';
