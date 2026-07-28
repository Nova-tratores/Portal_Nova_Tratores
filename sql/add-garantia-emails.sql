-- =============================================================================
-- garantia_emails — conversa com a fábrica por garantia.
-- direcao='enviado': gravado no envio (Message-ID do sendMail, pra casar reply).
-- direcao='recebido': gravado pelo cron IMAP (07:30/12:00 BRT) que lê a INBOX
-- do Gmail e casa a resposta com a garantia. garantia_id NULL = recebido de
-- fábrica que não conseguimos casar (fica guardado pra triagem).
-- Aplicar manualmente no SQL editor do Supabase.
-- =============================================================================

CREATE TABLE IF NOT EXISTS garantia_emails (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garantia_id    UUID REFERENCES garantias(id) ON DELETE CASCADE,
  direcao        TEXT NOT NULL CHECK (direcao IN ('enviado','recebido')),
  message_id     TEXT,                        -- normalizado sem <> ; chave de dedupe
  in_reply_to    TEXT,
  references_ids TEXT[],                      -- header References completo
  de             TEXT,
  para           TEXT[],
  assunto        TEXT,
  corpo_texto    TEXT,
  corpo_html     TEXT,
  data           TIMESTAMPTZ,                 -- Date do e-mail
  anexos         JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{nome,url,content_type,size}]
  uid            BIGINT,                      -- proveniência IMAP (só recebido)
  pasta          TEXT,
  lida           BOOLEAN NOT NULL DEFAULT FALSE,      -- enviado grava TRUE
  casado_por     TEXT,                        -- 'reply'|'numero'|'numero_externo'|'remetente_chassi'|NULL
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gar_emails_garantia ON garantia_emails (garantia_id, data);
CREATE INDEX IF NOT EXISTS idx_gar_emails_data     ON garantia_emails (direcao, data DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gar_emails_message_id
  ON garantia_emails (message_id) WHERE message_id IS NOT NULL;
-- Dedupe secundário: e-mails SEM Message-ID (sistemas de ticket/scanner) usam
-- a proveniência IMAP como chave — evita reinserção a cada execução do cron.
CREATE UNIQUE INDEX IF NOT EXISTS uq_gar_emails_uid
  ON garantia_emails (pasta, uid) WHERE direcao = 'recebido' AND uid IS NOT NULL;

-- RLS no padrão do módulo (v2 anti-deadlock: transação isolada por tabela;
-- authenticated lê/escreve, anon nada, DELETE só service role)
SET lock_timeout = '8s';
BEGIN;
ALTER TABLE garantia_emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS garantia_emails_select ON garantia_emails;
CREATE POLICY garantia_emails_select ON garantia_emails FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS garantia_emails_insert ON garantia_emails;
CREATE POLICY garantia_emails_insert ON garantia_emails FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS garantia_emails_update ON garantia_emails;
CREATE POLICY garantia_emails_update ON garantia_emails FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
COMMIT;

NOTIFY pgrst, 'reload schema';
