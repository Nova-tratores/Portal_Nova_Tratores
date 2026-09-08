-- =====================================================================
-- TICKETS ↔ REQUISIÇÕES (vínculos) — Portal Nova Tratores
-- Rodar no SQL Editor do Supabase. Idempotente.
--
-- Um ticket pode apontar pra N requisições (e amanhã pra OS, PPV etc. —
-- basta ampliar o CHECK de vinculo_tipo). O mapa de cotações NÃO precisa de
-- vínculo próprio: req_cotacao é 1:1 com a requisição (PK = id dela), então
-- vincular a requisição já traz as cotações.
--
-- Idioma do repo: vinculo_tipo + vinculo_ref TEXT sem FK + vinculo_label
-- snapshot (sql/marketing-acoes.sql, sql/opa-vinculo-veiculo.sql).
-- Leitura pelo browser via RLS (tickets_pode_ver); escrita SÓ service role
-- (rotas /api/tickets/*). Remoção = DELETE físico + evento 'vinculo_removido'
-- na timeline (o rastro fica lá, append-only).
-- =====================================================================

-- PRÉ-CHECK (crítico, igual ao de sql/create-war-room.sql): montar a lista do
-- CHECK de tickets_eventos.tipo a partir do que ESTÁ EM PRODUÇÃO, não da lista
-- do repo. Se algum tipo foi aplicado fora do git, recriar o CHECK só com a
-- lista abaixo QUEBRA INSERT em produção.
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'tickets_eventos'::regclass AND contype = 'c';
-- Se aparecer algum tipo que não esteja na lista abaixo, ADICIONÁ-LO antes de rodar.

-- ---------------------------------------------------------------------
-- 1) Tabela
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tickets_vinculos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  vinculo_tipo  TEXT NOT NULL CHECK (vinculo_tipo IN ('requisicao')),  -- extensível
  vinculo_ref   TEXT NOT NULL,                 -- "Requisicao".id como TEXTO (sem FK: PKs heterogêneas)
  vinculo_label TEXT NOT NULL DEFAULT '',      -- snapshot "#6423 TÍTULO" (sobrevive à requisição sumir)
  criado_por    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ticket_id, vinculo_tipo, vinculo_ref)  -- a mesma requisição não entra 2x no mesmo ticket
);

CREATE INDEX IF NOT EXISTS idx_tickets_vinculos_ticket ON tickets_vinculos(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_vinculos_ref    ON tickets_vinculos(vinculo_tipo, vinculo_ref);

COMMENT ON TABLE tickets_vinculos IS
  'Vínculos de um ticket a outras entidades do portal (hoje só requisicao). Escrita só via /api/tickets/*.';

-- ---------------------------------------------------------------------
-- 2) RLS — leitura por visibilidade do ticket; escrita bloqueada (service role)
-- ---------------------------------------------------------------------
ALTER TABLE tickets_vinculos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tickets_vinculos_select ON tickets_vinculos;
CREATE POLICY tickets_vinculos_select ON tickets_vinculos
  FOR SELECT TO authenticated
  USING (tickets_pode_ver(ticket_id));
-- Sem policies de INSERT/UPDATE/DELETE: mutações só pelo service role.

-- ---------------------------------------------------------------------
-- 3) Dois eventos novos na timeline (DROP + ADD no MESMO bloco — sem janela
--    sem constraint). Lista = tudo que existe em produção + os 2 novos.
-- ---------------------------------------------------------------------
ALTER TABLE tickets_eventos DROP CONSTRAINT IF EXISTS tickets_eventos_tipo_check;
ALTER TABLE tickets_eventos ADD CONSTRAINT tickets_eventos_tipo_check
  CHECK (tipo IN (
    -- v1 (genérico)
    'criacao', 'comentario', 'status', 'transferencia',
    'participante_adicionado', 'participante_removido',
    'pedido_atualizacao', 'edicao', 'anexo',
    -- v2 (SC / compras)
    'sc_criada', 'qtd_alterada', 'parecer_financeiro', 'pc_emitido',
    -- War Room (Fase 1)
    'wr_acao_criada', 'wr_decisao_vinculada',
    -- Vínculos (requisições) — sql/tickets-vinculos.sql
    'vinculo_adicionado', 'vinculo_removido'
  ));

-- ---------------------------------------------------------------------
-- 4) PostgREST precisa enxergar a FK nova pro embed tickets(...) funcionar
--    no browser (bloco "Tickets" do card da requisição).
-- ---------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- PÓS-CHECK:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'tickets_eventos_tipo_check';
--     -- deve conter 'vinculo_adicionado' e 'vinculo_removido'
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'tickets_vinculos';
--     -- só tickets_vinculos_select / SELECT
