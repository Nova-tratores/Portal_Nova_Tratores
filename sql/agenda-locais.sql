-- AGENDA COLETIVA — locais pré-definidos (José, 16/10/2026): o campo "Local" do compromisso
-- oferece estes; qualquer pessoa cria, renomeia ou tira locais pela própria agenda.
-- O mesmo local não pode ter dois compromissos no mesmo horário (conferido na API).
-- Idempotente. Leitura: todo logado. Escrita: só pela API (/api/agenda/locais, service role).

CREATE TABLE IF NOT EXISTS agenda_locais (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT NOT NULL CHECK (char_length(trim(nome)) BETWEEN 1 AND 80),
  ordem       INT NOT NULL DEFAULT 100,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  criado_por  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agenda_locais_nome_uidx ON agenda_locais (lower(trim(nome))) WHERE ativo;

INSERT INTO agenda_locais (nome, ordem)
SELECT v.nome, v.ordem FROM (VALUES ('Sala de Reunião', 1), ('Sala Pós Vendas', 2), ('Sala Irneh', 3)) AS v(nome, ordem)
WHERE NOT EXISTS (SELECT 1 FROM agenda_locais l WHERE lower(trim(l.nome)) = lower(v.nome) AND l.ativo);

ALTER TABLE agenda_locais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agenda_locais_ler ON agenda_locais;
CREATE POLICY agenda_locais_ler ON agenda_locais FOR SELECT TO authenticated USING (true);
REVOKE ALL ON agenda_locais FROM anon;
REVOKE INSERT, UPDATE, DELETE ON agenda_locais FROM authenticated;

NOTIFY pgrst, 'reload schema';
