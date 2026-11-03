-- ════════════════════════════════════════════════════════════════════
-- Opa: para quem é a ocorrência (03/11/2026)
--   todos       → portal + app dos mecânicos (comportamento de sempre)
--   escritorio  → só o portal; o app dos mecânicos NÃO mostra, não abre o
--                 pop-up e NÃO gera a penalidade de "OPA não resolvida"
--   oficina     → app dos mecânicos (o portal continua listando tudo)
-- Os Opas que já existem ficam 'todos' (nada muda para eles).
-- Idempotente. Sem esta migration o portal cria o Opa sem o campo e o app
-- dos mecânicos se comporta como antes (mostra tudo).
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE portal_opas ADD COLUMN IF NOT EXISTS publico TEXT NOT NULL DEFAULT 'todos';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_opas_publico_chk') THEN
    ALTER TABLE portal_opas ADD CONSTRAINT portal_opas_publico_chk
      CHECK (publico IN ('todos', 'escritorio', 'oficina'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
