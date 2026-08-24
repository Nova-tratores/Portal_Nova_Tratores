-- =====================================================================
-- Nova Tratores — /propostas: corrige trg_sync_convertido (bigint vazio)
-- Data: 2026-08-21
--
-- BUG: propostas normais têm Formulario.id_fabrica_ref = '' (o FormModal
-- grava string vazia p/ proposta que não veio da fábrica). O trigger
-- trg_sync_convertido fazia NEW.id_fabrica_ref::bigint sem tratar '' —
-- ao EDITAR a proposta (o UPDATE inclui id_fabrica_ref, disparando o
-- trigger), '' ::bigint estoura: "invalid input syntax for type bigint".
-- Status/soft-delete/motivo não mandavam id_fabrica_ref, por isso só a
-- edição quebrava. Achado reproduzindo no dev (Playwright).
--
-- Fix: tratar '' como nulo (nullif) antes do cast. Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION trg_sync_convertido()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Só sincroniza quando há uma referência REAL (não nula e não string vazia).
  IF nullif(NEW.id_fabrica_ref::text, '') IS NOT NULL THEN
    UPDATE "Proposta_Fabrica" SET convertido = true, atualizado_em = now()
     WHERE id = NEW.id_fabrica_ref::bigint AND coalesce(convertido, false) = false;
  END IF;
  RETURN NULL;
END $$;

-- O trigger tg_sync_convertido já aponta p/ esta função (CREATE OR REPLACE
-- basta; não precisa recriar o trigger).

-- =====================================================================
-- VERIFICAÇÃO: editar uma proposta comum (id_fabrica_ref = '') e salvar
-- deve funcionar sem o erro de bigint.
-- =====================================================================
