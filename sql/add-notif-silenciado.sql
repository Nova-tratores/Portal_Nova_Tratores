-- =============================================================================
-- Preferências de notificação por usuário.
-- Cada item em notif_silenciado é um módulo (ex: 'garantias', 'ppv') do qual
-- o usuário NÃO quer receber notificação. Default = array vazio = recebe tudo.
--
-- A regra de "módulos obrigatórios por categoria" é aplicada no app
-- (src/lib/notif/prefs.ts), não no banco — assim dá pra ajustar sem migration.
-- =============================================================================

ALTER TABLE portal_permissoes
  ADD COLUMN IF NOT EXISTS notif_silenciado TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_portal_permissoes_notif_silenciado
  ON portal_permissoes USING GIN (notif_silenciado)
  WHERE array_length(notif_silenciado, 1) > 0;
