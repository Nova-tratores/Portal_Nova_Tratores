-- =====================================================================
-- P1 (Trilho B) — RLS nas tabelas de feedbacks (CRM)
-- =====================================================================
-- Antes: politicas USING(true) (acesso total pela anon key).
-- Agora:
--  - LEITURA e ESCRITA (insert/update/delete) so para AUTENTICADOS. O CRM e
--    manipulado direto do navegador por usuario logado (src/lib/feedbacks/api.ts),
--    entao permitimos escrita autenticada (bloqueia so o anonimo). Sem escopo por
--    usuario (e um CRM interno compartilhado).
--  - Os escritores de SERVIDOR (motor de oportunidades: index.ts, r4-followup,
--    e a rota /api/feedbacks/oportunidades) foram migrados pra service role, que
--    ignora o RLS.
--
-- Pre-requisito: o deploy do codigo que acompanha este SQL ja deve estar no ar.
-- Idempotente.
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['feedback_registros','feedback_clientes_info','feedback_oportunidades','feedback_config_regras']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t||'_all', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t||'_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t||'_write', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true);', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true);', t||'_write', t);
  END LOOP;
END $$;
