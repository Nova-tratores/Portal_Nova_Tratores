-- =====================================================================
-- SISTEMA DE TICKETS INTERNOS (v1 — tipo genérico) — Portal Nova Tratores
-- Rodar no SQL Editor do Supabase.
--
-- Conceito: docs/conceito-sistema-tickets (ADRs 001–007).
-- Motor único de tickets: timeline append-only, responsável único,
-- participantes permanentes (saída só explícita), encerramento em 2 estágios.
-- O schema já nasce multi-tipo (coluna `tipo` + payload jsonb) — ADR-005.
--
-- Modelo de acesso:
--  - LEITURA direta pelo browser (anon key) controlada por RLS: vê o ticket
--    quem é solicitante, responsável, participante ativo, admin/dev, ou
--    qualquer autenticado se visibilidade = 'publico' (privado por padrão).
--  - ESCRITA só via rotas /api/tickets/* (service role) — as regras de
--    negócio (transições, transferência, timeline imutável) vivem no server.
--    Por isso NÃO há policies de INSERT/UPDATE/DELETE para authenticated.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  tipo TEXT NOT NULL DEFAULT 'generico',            -- ADR-005 ('generico'; 'compras' na v2)
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',               -- descrição de origem: IMUTÁVEL após criação
  categoria TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN (
    'aberto', 'em_andamento', 'aguardando_terceiro', 'aguardando_interno',
    'resolvido', 'fechado', 'cancelado'
  )),
  visibilidade TEXT NOT NULL DEFAULT 'privado' CHECK (visibilidade IN ('privado', 'publico')),
  prazo DATE,
  terceiro_envolvido TEXT NOT NULL DEFAULT '',      -- parte externa (texto livre na v1)
  solicitante_id UUID NOT NULL REFERENCES auth.users(id),
  responsavel_id UUID NOT NULL REFERENCES auth.users(id),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,       -- campos estruturados por tipo (v2: SC)
  resolvido_em TIMESTAMPTZ,
  fechado_em TIMESTAMPTZ,
  ultima_atividade_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Registro de TODOS que já participaram (solicitante e responsáveis entram
-- automaticamente; ninguém sai como efeito colateral — ADR-002).
CREATE TABLE IF NOT EXISTS tickets_participantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  adicionado_por UUID REFERENCES auth.users(id),
  removido_em TIMESTAMPTZ,                          -- saída EXPLÍCITA (nunca automática)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ticket_id, user_id)
);

-- Timeline: cronológica, imutável, append-only. O coração do sistema.
CREATE TABLE IF NOT EXISTS tickets_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  autor_id UUID REFERENCES auth.users(id),          -- NULL = evento do sistema (auto-fechamento)
  tipo TEXT NOT NULL CHECK (tipo IN (
    'criacao', 'comentario', 'status', 'transferencia',
    'participante_adicionado', 'participante_removido',
    'pedido_atualizacao', 'edicao', 'anexo'
  )),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,       -- {texto}, {de,para}, {campos}, ...
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tickets_responsavel ON tickets(responsavel_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_solicitante ON tickets(solicitante_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_atividade ON tickets(ultima_atividade_em DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_part_ticket ON tickets_participantes(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_part_user ON tickets_participantes(user_id) WHERE removido_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_eventos_ticket ON tickets_eventos(ticket_id, created_at);

-- ---------------------------------------------------------------------
-- Visibilidade (usada nas policies de SELECT das 3 tabelas)
-- SECURITY DEFINER de propósito: precisa ler tickets/participantes/permissões
-- sem recursão de RLS. Só responde se O CHAMADOR (auth.uid()) pode ver o
-- ticket — não vaza dados mesmo chamada diretamente.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tickets_pode_ver(p_ticket UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM tickets t
    WHERE t.id = p_ticket
      AND (
        t.visibilidade = 'publico'
        OR t.solicitante_id = auth.uid()
        OR t.responsavel_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM tickets_participantes p
          WHERE p.ticket_id = t.id AND p.user_id = auth.uid() AND p.removido_em IS NULL
        )
        OR EXISTS (
          SELECT 1 FROM portal_permissoes pp
          WHERE pp.user_id = auth.uid() AND (pp.is_admin IS TRUE OR pp.is_dev IS TRUE)
        )
      )
  );
$$;

-- ---------------------------------------------------------------------
-- RLS — leitura por visibilidade; escrita bloqueada (só service role)
-- ---------------------------------------------------------------------
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets_participantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tickets_select ON tickets;
CREATE POLICY tickets_select ON tickets
  FOR SELECT TO authenticated
  USING (tickets_pode_ver(id));

DROP POLICY IF EXISTS tickets_part_select ON tickets_participantes;
CREATE POLICY tickets_part_select ON tickets_participantes
  FOR SELECT TO authenticated
  USING (tickets_pode_ver(ticket_id));

DROP POLICY IF EXISTS tickets_eventos_select ON tickets_eventos;
CREATE POLICY tickets_eventos_select ON tickets_eventos
  FOR SELECT TO authenticated
  USING (tickets_pode_ver(ticket_id));

-- ---------------------------------------------------------------------
-- Realtime (timeline ao vivo na tela de detalhe; entrega respeita a RLS)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE tickets_eventos;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
