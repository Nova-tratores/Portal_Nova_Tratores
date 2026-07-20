-- =============================================================================
-- Nomes de pessoa unificados — Requisicao.solicitante
--
-- O mesmo nome chegava com caixa diferente conforme a origem ("Nicolas Dario"
-- digitado no portal, "NICOLAS DARIO" vindo do app) e a pessoa virava DUAS nos
-- filtros. Aqui:
--   1) nt_nome_pessoa(): Title Case BR (preposições de/da/do... minúsculas,
--      menos no início) — MESMA régua do normalizarNomePessoa (src/lib/texto.ts)
--   2) trigger em "Requisicao": normaliza o solicitante em TODO insert/update,
--      venha do portal ou de qualquer app conectado ao banco (e-mails passam
--      intactos — o Kanban resolve e-mail → nome)
--   3) backfill das linhas já gravadas
--
-- Correr no Supabase (PORTAL): SQL Editor -> colar -> Run. Idempotente.
-- =============================================================================

CREATE OR REPLACE FUNCTION nt_nome_pessoa(t TEXT) RETURNS TEXT AS $$
DECLARE
  partes TEXT[];
  saida  TEXT[] := '{}';
  p      TEXT;
  i      INT := 0;
BEGIN
  IF t IS NULL OR btrim(t) = '' THEN RETURN NULL; END IF;
  partes := regexp_split_to_array(lower(btrim(regexp_replace(t, '\s+', ' ', 'g'))), ' ');
  FOREACH p IN ARRAY partes LOOP
    i := i + 1;
    IF i > 1 AND p IN ('de','da','do','das','dos','e','di','du') THEN
      saida := array_append(saida, p);
    ELSE
      saida := array_append(saida, upper(substr(p, 1, 1)) || substr(p, 2));
    END IF;
  END LOOP;
  RETURN array_to_string(saida, ' ');
END $$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION requisicao_normalizar_solicitante() RETURNS TRIGGER AS $$
BEGIN
  -- e-mail fica como está (o Kanban resolve e-mail -> nome do usuário)
  IF NEW.solicitante IS NOT NULL AND position('@' in NEW.solicitante) = 0 THEN
    NEW.solicitante := nt_nome_pessoa(NEW.solicitante);
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_requisicao_nome_solicitante ON "Requisicao";
CREATE TRIGGER trg_requisicao_nome_solicitante
  BEFORE INSERT OR UPDATE OF solicitante ON "Requisicao"
  FOR EACH ROW EXECUTE FUNCTION requisicao_normalizar_solicitante();

-- Backfill do que já existe (e-mails de fora)
UPDATE "Requisicao"
   SET solicitante = nt_nome_pessoa(solicitante)
 WHERE solicitante IS NOT NULL
   AND position('@' in solicitante) = 0
   AND solicitante <> nt_nome_pessoa(solicitante);

-- Conferência: SELECT solicitante, count(*) FROM "Requisicao"
--   WHERE solicitante IS NOT NULL GROUP BY 1 ORDER BY 1;
