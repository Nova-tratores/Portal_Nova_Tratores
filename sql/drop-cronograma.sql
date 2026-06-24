-- ════════════════════════════════════════════════════════════════════
-- Cronograma — rollback (Fase 0)
-- Remove o schema inteiro (tabelas, enums, RLS, RPCs) em cascata.
-- O CASCADE remove as tabelas da publicação supabase_realtime junto.
-- ════════════════════════════════════════════════════════════════════

drop schema if exists cronograma cascade;
