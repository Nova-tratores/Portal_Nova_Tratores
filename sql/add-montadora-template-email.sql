-- =============================================================================
-- Garantias: configurar template SG + destinatários de e-mail por montadora.
-- Mahindra usa o template SG (xlsx) e envia automaticamente para a fábrica
-- quando o garantista clica em "Enviar à fábrica".
-- =============================================================================

ALTER TABLE garantia_montadoras
  ADD COLUMN IF NOT EXISTS email_destinatarios TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tipo_template TEXT NOT NULL DEFAULT 'sem_template',
  ADD COLUMN IF NOT EXISTS auto_enviar_email BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_assunto TEXT,
  ADD COLUMN IF NOT EXISTS email_corpo TEXT;

-- Garante o CHECK em tipo_template (template suportado pelo gerador)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'garantia_montadoras_tipo_template_check'
  ) THEN
    ALTER TABLE garantia_montadoras
      ADD CONSTRAINT garantia_montadoras_tipo_template_check
      CHECK (tipo_template IN ('sem_template', 'mahindra'));
  END IF;
END $$;

-- Acrescenta a categoria 'envio_fabrica' aos anexos (SG enviado pela equipe)
ALTER TABLE garantia_anexos DROP CONSTRAINT IF EXISTS garantia_anexos_categoria_check;
ALTER TABLE garantia_anexos ADD CONSTRAINT garantia_anexos_categoria_check
  CHECK (categoria IN ('tecnico','garantista','pendencia_pedido','pendencia_resposta','retorno_fabrica','envio_fabrica'));

-- Valor das peças pagas em garantia (soma das peças marcadas 'aprovada' na finalização)
ALTER TABLE garantias
  ADD COLUMN IF NOT EXISTS valor_pago_pecas NUMERIC(12,2);
