-- =====================================================================
-- Garantias — devolve a ESCRITA aos usuários logados (app dos mecânicos)
-- =====================================================================
-- O p1-rls-garantias.sql deixou as tabelas SÓ-LEITURA para clientes, com a
-- premissa "tudo passa pelas rotas /api/garantias/*". Verdade pro PORTAL,
-- FALSA pro NT_MECANICOS: o app do técnico escreve DIRETO no Supabase
-- (criarGarantia, responderPendencia, anexos) — é o desenho do módulo
-- ("sem HTTP entre apps"). Consequência real: o técnico respondia o B.O.
-- e o UPDATE afetava 0 linhas SEM ERRO (bug da GAR-0025, 21/07/2026) —
-- só o evento entrava, porque garantia_eventos ficou fora do P1.
--
-- Correção: INSERT/UPDATE para `authenticated` (técnico logado). O objetivo
-- do P1 se mantém: `anon` continua sem acesso nenhum. DELETE continua só via
-- service role (nenhum fluxo do app apaga linhas dessas tabelas).
--
-- v2 (22/07/2026): a v1 fazia tudo num DO $$ (uma transação, locks nas 6
-- tabelas ao mesmo tempo) e DEADLOCKOU com o app em produção lendo as
-- tabelas em join. Agora: lock_timeout curto + UMA TABELA POR TRANSAÇÃO
-- (COMMIT entre elas) — nunca seguramos lock de duas tabelas juntas.
-- Se alguma tabela der "lock timeout", basta RODAR DE NOVO: é idempotente
-- e continua de onde parou (as já commitadas ficam prontas).
--
-- Correr no Supabase: SQL Editor -> colar -> Run.
-- =====================================================================

SET lock_timeout = '8s';

-- ── garantias ────────────────────────────────────────────────────────
BEGIN;
ALTER TABLE garantias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS garantias_select ON garantias;
CREATE POLICY garantias_select ON garantias FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS garantias_insert ON garantias;
CREATE POLICY garantias_insert ON garantias FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS garantias_update ON garantias;
CREATE POLICY garantias_update ON garantias FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS garantias_all ON garantias;
COMMIT;

-- ── garantia_montadoras ──────────────────────────────────────────────
BEGIN;
ALTER TABLE garantia_montadoras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS garantia_montadoras_select ON garantia_montadoras;
CREATE POLICY garantia_montadoras_select ON garantia_montadoras FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS garantia_montadoras_insert ON garantia_montadoras;
CREATE POLICY garantia_montadoras_insert ON garantia_montadoras FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS garantia_montadoras_update ON garantia_montadoras;
CREATE POLICY garantia_montadoras_update ON garantia_montadoras FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS garantia_montadoras_all ON garantia_montadoras;
COMMIT;

-- ── garantia_pecas ───────────────────────────────────────────────────
BEGIN;
ALTER TABLE garantia_pecas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS garantia_pecas_select ON garantia_pecas;
CREATE POLICY garantia_pecas_select ON garantia_pecas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS garantia_pecas_insert ON garantia_pecas;
CREATE POLICY garantia_pecas_insert ON garantia_pecas FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS garantia_pecas_update ON garantia_pecas;
CREATE POLICY garantia_pecas_update ON garantia_pecas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS garantia_pecas_all ON garantia_pecas;
COMMIT;

-- ── garantia_pendencias ──────────────────────────────────────────────
BEGIN;
ALTER TABLE garantia_pendencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS garantia_pendencias_select ON garantia_pendencias;
CREATE POLICY garantia_pendencias_select ON garantia_pendencias FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS garantia_pendencias_insert ON garantia_pendencias;
CREATE POLICY garantia_pendencias_insert ON garantia_pendencias FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS garantia_pendencias_update ON garantia_pendencias;
CREATE POLICY garantia_pendencias_update ON garantia_pendencias FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS garantia_pendencias_all ON garantia_pendencias;
COMMIT;

-- ── garantia_anexos ──────────────────────────────────────────────────
BEGIN;
ALTER TABLE garantia_anexos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS garantia_anexos_select ON garantia_anexos;
CREATE POLICY garantia_anexos_select ON garantia_anexos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS garantia_anexos_insert ON garantia_anexos;
CREATE POLICY garantia_anexos_insert ON garantia_anexos FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS garantia_anexos_update ON garantia_anexos;
CREATE POLICY garantia_anexos_update ON garantia_anexos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS garantia_anexos_all ON garantia_anexos;
COMMIT;

-- ── garantia_eventos ─────────────────────────────────────────────────
BEGIN;
ALTER TABLE garantia_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS garantia_eventos_select ON garantia_eventos;
CREATE POLICY garantia_eventos_select ON garantia_eventos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS garantia_eventos_insert ON garantia_eventos;
CREATE POLICY garantia_eventos_insert ON garantia_eventos FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS garantia_eventos_update ON garantia_eventos;
CREATE POLICY garantia_eventos_update ON garantia_eventos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
-- garantia_eventos ainda tinha a policy permissiva original — remove
DROP POLICY IF EXISTS garantia_eventos_all ON garantia_eventos;
COMMIT;

NOTIFY pgrst, 'reload schema';

-- Conferência:
-- SELECT tablename, policyname, cmd, roles FROM pg_policies
--  WHERE tablename LIKE 'garantia%' ORDER BY tablename, policyname;
