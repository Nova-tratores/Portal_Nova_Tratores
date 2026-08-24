-- ============================================================================
-- Auditoria do robô de classificação de produtos recém-recebidos
-- (/api/ajustes/cron/classificar-recebidos → src/lib/ajustes/robo-recebidos.ts).
--
-- Registra cada produto que o robô reclassificou de "Sem família" → "Peças"
-- (valor < 10k, incluído nos últimos N dias), o Tipo sugerido e as ids das
-- tarefas criadas (portal_tarefas). O robô roda server-side e NÃO grava audit_log
-- automático — este log é a trilha do que ele fez.
--
-- Idempotente. Executar 1× no SQL Editor do Supabase.
-- ============================================================================

CREATE TABLE IF NOT EXISTS recebimento_auto_familia_log (
  id             BIGSERIAL PRIMARY KEY,
  conta_omie     TEXT NOT NULL,                 -- minusculo: nova/castro
  codigo_produto BIGINT NOT NULL,               -- id interno Omie
  codigo         TEXT,                          -- SKU
  descricao      TEXT,
  familia_de     TEXT,                          -- 'Sem família'
  familia_para   TEXT,                          -- 'Peças'
  valor_unit     NUMERIC(14,2),
  tipo_sugerido  TEXT,                          -- sugestão da característica "Tipo:"
  tarefa_loc_id  BIGINT,                        -- portal_tarefas.id (confirmar localização)
  tarefa_tipo_id BIGINT,                        -- portal_tarefas.id (confirmar Tipo)
  gerado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_familia_log_conta   ON recebimento_auto_familia_log(conta_omie);
CREATE INDEX IF NOT EXISTS idx_auto_familia_log_produto ON recebimento_auto_familia_log(conta_omie, codigo_produto);
