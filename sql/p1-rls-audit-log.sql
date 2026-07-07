-- =====================================================================
-- P1 (Trilho B) — Tranca o audit_log
-- =====================================================================
-- Antes: RLS estava EXPLICITAMENTE desligado (create-audit-log.sql:36) e o
-- navegador inseria direto com a anon key. Consequência: o log de auditoria era
-- forjável (dava pra registrar ação em nome de outro), legível por qualquer um
-- com a anon key, e apagável.
--
-- Agora:
--  - LEITURA só para usuários AUTENTICADOS (mata o acesso anônimo pela anon key).
--    As telas de logs/histórico continuam lendo (usuário logado = role
--    authenticated). Nenhuma rota de API lê audit_log, então não quebra servidor.
--  - ESCRITA/UPDATE/DELETE pelo cliente: BLOQUEADOS (sem política). A gravação
--    passou pro servidor (rota /api/audit/log e o helper registrarAuditLog), que
--    usa o SERVICE_ROLE (ignora RLS) e grava a identidade real do token.
--
-- Aplicar no Supabase (SQL Editor). Idempotente.
-- =====================================================================

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_all    ON audit_log;
DROP POLICY IF EXISTS audit_log_select ON audit_log;
DROP POLICY IF EXISTS audit_log_write  ON audit_log;

-- Leitura: só autenticados. Anônimo (anon key sem login) não lê mais.
CREATE POLICY audit_log_select
  ON audit_log FOR SELECT
  TO authenticated
  USING (true);

-- Sem política de INSERT/UPDATE/DELETE → cliente não escreve. Só o servidor
-- (service role) grava, via /api/audit/log e registrarAuditLog.
