-- =====================================================================
-- SOLICITAÇÃO DE COMPRAS (SC — tipo='compras') — v2 do motor de tickets
-- Portal Nova Tratores. Rodar no SQL Editor do Supabase.
--
-- Conceito: docs/conceito-sistema-tickets (ADRs 005–007). A SC é um TIPO de
-- ticket com trilho de alçadas (vendedor → diretoria → financeiro → comprador),
-- por cima do mesmo motor da v1: timeline append-only (o "livro de decisões"),
-- participantes permanentes, notificações. NÃO é um sistema paralelo.
--
-- O que esta migration adiciona:
--   1) coluna `sc_etapa` (a máquina de estados do trilho; NULL p/ ticket genérico)
--   2) novos tipos de evento na timeline imutável (sc_criada, qtd_alterada, ...)
--   3) `tickets_compras_config`: singleton com as pessoas fixas por etapa
--      (UMA por etapa) + limiares do gatilho de bloqueio (valor / excesso estoque)
--
-- Escrita continua SÓ via /api/tickets/* (service role): sem policies de
-- INSERT/UPDATE/DELETE. A config tem apenas SELECT para authenticated (a UI
-- precisa saber "sou eu o financeiro?" para mostrar o painel certo).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Etapa do trilho da SC (NULL para todo ticket tipo='generico')
-- ---------------------------------------------------------------------
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sc_etapa TEXT
  CHECK (sc_etapa IS NULL OR sc_etapa IN (
    'vendedor', 'diretoria', 'financeiro', 'comprador', 'concluida', 'cancelada'
  ));

CREATE INDEX IF NOT EXISTS idx_tickets_sc_etapa ON tickets(sc_etapa) WHERE tipo = 'compras';

-- ---------------------------------------------------------------------
-- 2) Novos tipos de evento na timeline (o CHECK inline da v1 nasce como
--    tickets_eventos_tipo_check; se o nome divergir, conferir com:
--      SELECT conname FROM pg_constraint
--       WHERE conrelid = 'tickets_eventos'::regclass AND contype = 'c';
--    e ajustar o DROP abaixo.)
-- ---------------------------------------------------------------------
ALTER TABLE tickets_eventos DROP CONSTRAINT IF EXISTS tickets_eventos_tipo_check;
ALTER TABLE tickets_eventos ADD CONSTRAINT tickets_eventos_tipo_check
  CHECK (tipo IN (
    'criacao', 'comentario', 'status', 'transferencia',
    'participante_adicionado', 'participante_removido',
    'pedido_atualizacao', 'edicao', 'anexo',
    -- SC (v2): o registro imutável de cada decisão do trilho
    'sc_criada', 'qtd_alterada', 'parecer_financeiro', 'pc_emitido'
  ));

-- ---------------------------------------------------------------------
-- 3) Config da SC: pessoas fixas por etapa (UMA por etapa) + limiares do
--    gatilho de bloqueio. Linha única (id fixo = true).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tickets_compras_config (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),   -- garante no máximo 1 linha
  diretoria_id UUID REFERENCES auth.users(id),
  financeiro_id UUID REFERENCES auth.users(id),
  comprador_id UUID REFERENCES auth.users(id),
  valor_limite_bloqueio NUMERIC,                    -- NULL = sem gatilho de valor
  qtd_excesso_estoque   NUMERIC,                    -- NULL = sem gatilho de estoque
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tickets_compras_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tickets_compras_config_select ON tickets_compras_config;
CREATE POLICY tickets_compras_config_select ON tickets_compras_config
  FOR SELECT TO authenticated
  USING (true);   -- escrita só via service role (rota admin); leitura livre p/ autenticados
