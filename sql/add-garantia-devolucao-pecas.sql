-- =============================================================================
-- Devolução de peças à fábrica (prova de destruição) — Ventura / Kuhn / Tatu.
-- A garantia finaliza normal (Aprovada, valores pagos) e a devolução fica como
-- pendência anexa (padrão da cobrança ao cliente): campos devolucao_* na
-- garantia + coluna virtual "Devolução de peças" no kanban. SEM status novo.
--
-- ⚠️ Aplicar manualmente no SQL editor do Supabase ANTES do deploy do portal
-- (o GET do kanban passa a filtrar por devolucao_status; o código tem fallback,
-- mas o certo é a coluna existir primeiro).
-- =============================================================================

-- 1) Flag por montadora: fábrica exige a devolução das peças usadas
ALTER TABLE garantia_montadoras ADD COLUMN IF NOT EXISTS exige_devolucao_pecas BOOLEAN NOT NULL DEFAULT FALSE;

-- Conferir os nomes reais antes (Tatu pode estar "Tatu Marchesan"; Ventura
-- pode nem existir ainda — crie pela tela e marque a flag no editor):
--   SELECT id, nome FROM garantia_montadoras ORDER BY nome;
UPDATE garantia_montadoras
   SET exige_devolucao_pecas = TRUE, updated_at = now()
 WHERE lower(nome) LIKE '%ventura%'
    OR lower(nome) LIKE '%kuhn%'
    OR lower(nome) LIKE '%tatu%';

-- 2) Campos da devolução na garantia
ALTER TABLE garantias ADD COLUMN IF NOT EXISTS devolucao_status         TEXT NOT NULL DEFAULT 'nao_aplicavel';
ALTER TABLE garantias DROP CONSTRAINT IF EXISTS garantias_devolucao_status_check;
-- 'dispensada' é distinto de 'nao_aplicavel' de propósito: dispensa por engano
-- tem volta (reabrir), sem permitir abrir devolução em qualquer aprovada.
ALTER TABLE garantias ADD CONSTRAINT garantias_devolucao_status_check
  CHECK (devolucao_status IN ('nao_aplicavel','pendente','enviada','dispensada'));
ALTER TABLE garantias ADD COLUMN IF NOT EXISTS devolucao_prazo          DATE;
ALTER TABLE garantias ADD COLUMN IF NOT EXISTS devolucao_enviada_em     TIMESTAMPTZ;
ALTER TABLE garantias ADD COLUMN IF NOT EXISTS devolucao_nf             TEXT;
ALTER TABLE garantias ADD COLUMN IF NOT EXISTS devolucao_transportadora TEXT;
ALTER TABLE garantias ADD COLUMN IF NOT EXISTS devolucao_rastreio       TEXT;
ALTER TABLE garantias ADD COLUMN IF NOT EXISTS devolucao_obs            TEXT;
ALTER TABLE garantias ADD COLUMN IF NOT EXISTS devolucao_alertado_em    DATE;

-- 3) Categoria de anexo do comprovante de envio
ALTER TABLE garantia_anexos DROP CONSTRAINT IF EXISTS garantia_anexos_categoria_check;
ALTER TABLE garantia_anexos ADD CONSTRAINT garantia_anexos_categoria_check
  CHECK (categoria IN ('tecnico','garantista','pendencia_pedido','pendencia_resposta',
    'retorno_fabrica','envio_fabrica','foto_garantista','nf_venda','relatorio_at',
    'devolucao_pecas'));

-- 4) Índice pro cron de alerta de prazo
CREATE INDEX IF NOT EXISTS idx_garantias_devolucao_prazo
  ON garantias (devolucao_prazo) WHERE devolucao_status = 'pendente';
