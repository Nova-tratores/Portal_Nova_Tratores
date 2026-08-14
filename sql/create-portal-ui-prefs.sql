-- =====================================================================
-- PREFERÊNCIAS DE UI POR USUÁRIO (portal_ui_prefs)
-- Rodar manualmente no SQL Editor do Supabase.
--
-- Tabela genérica chave→valor para guardar preferências de tela por
-- usuário (ex.: ordem e visibilidade das colunas da /ajustes/caracteristicas),
-- para valerem em qualquer navegador/computador. `valor` é jsonb livre.
--
-- Acesso: leitura via RLS (cada um vê só as próprias);
-- escrita SÓ via /api/perfil/ui-prefs (service role), como o resto do portal.
-- =====================================================================

CREATE TABLE IF NOT EXISTS portal_ui_prefs (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chave      TEXT NOT NULL,                            -- ex.: 'caracteristicas-colunas'
  valor      JSONB NOT NULL DEFAULT '{}'::jsonb,       -- payload livre da tela
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, chave)
);

ALTER TABLE portal_ui_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_ui_prefs_select ON portal_ui_prefs;
CREATE POLICY portal_ui_prefs_select ON portal_ui_prefs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Sem policies de INSERT/UPDATE/DELETE: mutações só pelo service role.
