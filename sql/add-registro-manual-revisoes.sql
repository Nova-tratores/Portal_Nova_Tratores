-- ============================================================================
-- REVISÕES/INSPEÇÃO — registro MANUAL de envio (20/08/2026)
--
-- O selo "Notificado" da timeline só acende quando existe linha em
-- revisao_emails / inspecao_emails, e essas linhas só nascem quando o PORTAL
-- envia o e-mail. Revisão enviada por fora (Gmail direto, WhatsApp) ficava
-- eternamente "Pendente" — e ainda segurava a pendência Mahindra da OS.
--
-- Agora dá pra REGISTRAR o envio na mão. A flag separa o que o sistema
-- mandou do que alguém declarou ter mandado (a UI mostra "registro manual"
-- e só o manual pode ser desfeito).
-- Idempotente. Rodar no SQL Editor do Supabase.
-- ============================================================================

ALTER TABLE revisao_emails  ADD COLUMN IF NOT EXISTS registro_manual BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE revisao_emails  ADD COLUMN IF NOT EXISTS observacao_manual TEXT;
ALTER TABLE inspecao_emails ADD COLUMN IF NOT EXISTS registro_manual BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE inspecao_emails ADD COLUMN IF NOT EXISTS observacao_manual TEXT;

NOTIFY pgrst, 'reload schema';
