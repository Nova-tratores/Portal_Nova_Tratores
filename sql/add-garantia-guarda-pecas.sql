-- =============================================================================
-- Guarda de peças (quarentena antes do descarte) — PADRÃO DA EMPRESA, vale pra
-- TODAS as montadoras. Peça substituída em garantia APROVADA fica guardada por
-- 90 dias (prazo editável) antes de poder ser descartada — a fábrica pode pedir
-- inspeção nesse meio tempo. Pendência anexa à garantia (molde da devolução de
-- peças: campos guarda_* + coluna virtual "Guarda de peças" no kanban, SEM
-- status novo). Fotos de ONDE a peça está guardada = anexo 'guarda_pecas';
-- prova do descarte (foto/vídeo da destruição) = anexo 'descarte_pecas'.
--
-- Não abre guarda quando a fábrica pediu a DEVOLUÇÃO das peças (elas vão
-- embora) nem quando a garantia não tem peça.
--
-- ⚠️ Aplicar manualmente no SQL editor do Supabase ANTES do deploy (o código
-- tem fallback: sem as colunas, finalizar ignora a guarda e a seção avisa).
-- =============================================================================

-- 1) Campos da guarda na garantia
ALTER TABLE garantias ADD COLUMN IF NOT EXISTS guarda_status        TEXT NOT NULL DEFAULT 'nao_aplicavel';
ALTER TABLE garantias DROP CONSTRAINT IF EXISTS garantias_guarda_status_check;
-- 'dispensada' distinto de 'nao_aplicavel' de propósito (mesma razão da
-- devolução): dispensa por engano tem volta via reabrir.
ALTER TABLE garantias ADD CONSTRAINT garantias_guarda_status_check
  CHECK (guarda_status IN ('nao_aplicavel','pendente','descartada','dispensada'));
ALTER TABLE garantias ADD COLUMN IF NOT EXISTS guarda_prazo         DATE;          -- a partir daqui PODE descartar
ALTER TABLE garantias ADD COLUMN IF NOT EXISTS guarda_descartada_em TIMESTAMPTZ;
ALTER TABLE garantias ADD COLUMN IF NOT EXISTS guarda_obs           TEXT;
ALTER TABLE garantias ADD COLUMN IF NOT EXISTS guarda_alertado_em   DATE;          -- anti-spam do aviso "já pode descartar"

-- 2) Categorias de anexo novas (foto da guarda + prova do descarte)
ALTER TABLE garantia_anexos DROP CONSTRAINT IF EXISTS garantia_anexos_categoria_check;
ALTER TABLE garantia_anexos ADD CONSTRAINT garantia_anexos_categoria_check
  CHECK (categoria IN ('tecnico','garantista','pendencia_pedido','pendencia_resposta',
    'retorno_fabrica','envio_fabrica','foto_garantista','nf_venda','relatorio_at',
    'devolucao_pecas','guarda_pecas','descarte_pecas'));

-- 3) Índice pro cron de aviso "prazo cumprido — já pode descartar"
CREATE INDEX IF NOT EXISTS idx_garantias_guarda_prazo
  ON garantias (guarda_prazo) WHERE guarda_status = 'pendente';

-- 4) SEM backfill automático ("modo natural"): garantia antiga aprovada ganha a
-- guarda pelo botão "Iniciar guarda das peças" no card, quando alguém abrir.
-- Se quiser abrir em lote nas aprovadas dos últimos 90 dias que têm peça e não
-- devolveram à fábrica, rode (opcional, revisar antes):
--   UPDATE garantias g
--      SET guarda_status = 'pendente',
--          guarda_prazo  = (g.finalizada_em AT TIME ZONE 'America/Sao_Paulo')::date + 90,
--          updated_at    = now()
--    WHERE g.status = 'aprovada'
--      AND g.guarda_status = 'nao_aplicavel'
--      AND COALESCE(g.devolucao_status,'nao_aplicavel') NOT IN ('pendente','enviada')
--      AND g.finalizada_em >= now() - interval '90 days'
--      AND EXISTS (SELECT 1 FROM garantia_pecas p WHERE p.garantia_id = g.id);
