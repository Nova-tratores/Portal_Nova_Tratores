-- =====================================================================
-- WAR ROOM (Fase 1) — Portal Nova Tratores
-- Rodar no SQL Editor do Supabase (aplicação manual, como as demais migrations).
--
-- O War Room é a PAUTA VIVA da reunião semanal de recuperação (segundas, 8h).
-- Roda EM CIMA do motor de tickets (docs/modulo-tickets.md): cada AÇÃO do plano
-- é um ticket tipo='war_room' (bola/status/timeline no motor); a camada
-- estratégica vive em tabelas satélite aqui.
--
-- Modelo de acesso — POR LISTA EXPLÍCITA de membros, nunca por cargo/papel:
--   nucleo  → vê tudo (caixa, ponte, definições estratégicas, ata completa).
--   membro  → plano de ações, sentinelas em versão REDUZIDA (farol+margem+giro,
--             SEM valores de caixa/antecipação) e a pauta operacional.
--   dono de ação fora da lista → vê apenas as próprias ações + versão lite.
-- O corte de sensibilidade acontece NO PAYLOAD (RLS + views), nunca só na UI.
--
-- Regra de escrita (padrão do repo): o browser SÓ LÊ (anon key + RLS de SELECT).
-- Toda mutação passa por /api/war-room/* (service role). Por isso NÃO há policy
-- de INSERT/UPDATE/DELETE para authenticated em nenhuma tabela nova.
--
-- Nota de integridade referencial: as colunas de usuário referenciam
-- auth.users(id) — mesmo padrão do motor de tickets. financeiro_usu.id É o id
-- do usuário no auth (ver p1-rls-financeiro-usu.sql), então as views fazem JOIN
-- em financeiro_usu apenas para resolver nome/avatar.
-- =====================================================================


-- =====================================================================
-- 1) AJUSTES NO MOTOR (mínimos, aditivos)
-- =====================================================================

-- PRÉ-CHECK 1 (rodar ANTES de aplicar, e conferir o resultado):
--   -- tickets.tipo deve NÃO ter CHECK (esperado: 0 linhas). Se tiver, incluir
--   -- 'war_room' na recriação desse constraint também.
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'tickets'::regclass AND contype = 'c'
--      AND pg_get_constraintdef(oid) ILIKE '%tipo%';
--
-- PRÉ-CHECK 2 (crítico): montar a lista abaixo a partir do que ESTÁ EM PRODUÇÃO,
-- não da lista que o repo espera. Se algum tipo de evento foi aplicado fora do
-- repo, recriar o CHECK só com a lista do código QUEBRA INSERT em produção.
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'tickets_eventos'::regclass AND contype = 'c';
--   -- Ajustar o nome no DROP abaixo (default: tickets_eventos_tipo_check) e
--   -- garantir que a lista do ADD contém TODOS os tipos já existentes + os 2 novos.
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
    'wr_acao_criada', 'wr_decisao_vinculada'
  ));


-- =====================================================================
-- 2) war_room_membros — LISTA EXPLÍCITA de acesso
--    Desativar nunca apaga (histórico de quem esteve no núcleo é auditável).
-- =====================================================================
CREATE TABLE IF NOT EXISTS war_room_membros (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nivel TEXT NOT NULL CHECK (nivel IN ('nucleo', 'membro')),
  ativo BOOLEAN NOT NULL DEFAULT true,
  adicionado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wr_membros_ativo ON war_room_membros(nivel) WHERE ativo;

-- Log APPEND-ONLY de mudanças de acesso (quem entrou/saiu/mudou de nível é
-- auditável — a tabela acima guarda só o estado atual, com PK por usuário).
CREATE TABLE IF NOT EXISTS war_room_membros_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nivel TEXT,                                       -- nível resultante
  ativo BOOLEAN,                                    -- estado resultante
  acao TEXT NOT NULL CHECK (acao IN ('add', 'update', 'remove')),
  por UUID REFERENCES auth.users(id),               -- quem fez a mudança
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wr_membros_log ON war_room_membros_log(user_id, created_at);


-- =====================================================================
-- 3) war_room_acoes — camada estratégica (1:1 com ticket tipo='war_room')
-- =====================================================================
CREATE TABLE IF NOT EXISTS war_room_acoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
  fase TEXT NOT NULL CHECK (fase IN (
    '0_estancar', '1_atacar', '2_redimensionar', '3_governanca'
  )),
  causa_raiz TEXT NOT NULL DEFAULT '',
  entregavel TEXT NOT NULL DEFAULT '',
  indicador TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT '',
  consequencia TEXT NOT NULL DEFAULT '',
  prazo_estrategico DATE,
  ordem INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wr_acoes_fase ON war_room_acoes(fase, ordem);


-- =====================================================================
-- 4) war_room_snapshots — foto IMUTÁVEL da segunda-feira
--    origem jsonb: por campo 'auto' | 'manual' (cron pré-preenche o derivável;
--    o núcleo edita o manual até fechar). pauta_congelada: cópia da pauta no
--    momento do fechamento. Depois de fechado_em, o banco recusa UPDATE.
-- =====================================================================
CREATE TABLE IF NOT EXISTS war_room_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semana_inicio DATE NOT NULL UNIQUE,               -- segunda-feira da semana
  margem_semana NUMERIC,                            -- fração (ex.: 0.12 = 12%)
  tratores_vendidos INT,
  entradas_patio INT,
  caixa_30d NUMERIC,
  caixa_60d NUMERIC,
  caixa_90d NUMERIC,
  volume_antecipado NUMERIC,
  farol_margem TEXT CHECK (farol_margem IS NULL OR farol_margem IN ('verde','amarelo','vermelho')),
  farol_giro   TEXT CHECK (farol_giro   IS NULL OR farol_giro   IN ('verde','amarelo','vermelho')),
  farol_caixa  TEXT CHECK (farol_caixa  IS NULL OR farol_caixa  IN ('verde','amarelo','vermelho')),
  origem JSONB NOT NULL DEFAULT '{}'::jsonb,        -- {campo: 'auto'|'manual'}
  pauta_congelada JSONB,                            -- pauta completa no fechamento (NÚCLEO)
  pauta_congelada_lite JSONB,                       -- pauta já filtrada (sem caixa/definições) p/ MEMBRO
  fechado_em TIMESTAMPTZ,
  fechado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wr_snapshots_semana ON war_room_snapshots(semana_inicio DESC);

-- Imutabilidade após fechamento: só barra UPDATE quando a linha JÁ estava
-- fechada (permite o service role editar campos manuais enquanto aberta, e
-- permite o próprio ato de fechar — que carimba fechado_em pela primeira vez).
-- (Molde: decisoes_bloqueia_mutacao em create-decisoes.sql.)
CREATE OR REPLACE FUNCTION wr_snapshot_imutavel_apos_fechar() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.fechado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Snapshot da semana % já foi fechado e é imutável.', OLD.semana_inicio;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS wr_snapshot_lock ON war_room_snapshots;
CREATE TRIGGER wr_snapshot_lock
  BEFORE UPDATE ON war_room_snapshots
  FOR EACH ROW EXECUTE FUNCTION wr_snapshot_imutavel_apos_fechar();


-- =====================================================================
-- 6) war_room_definicoes — definições estratégicas pendentes (NÚCLEO)
--    (definida antes de decisoes por causa da FK definicao_id)
-- =====================================================================
CREATE TABLE IF NOT EXISTS war_room_definicoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tema TEXT NOT NULL,                               -- título curto
  contexto TEXT NOT NULL DEFAULT '',               -- o problema em 2–4 linhas
  decisao_a_extrair TEXT NOT NULL,                 -- qual decisão a conversa precisa produzir
  dados_necessarios TEXT NOT NULL DEFAULT '',      -- material de apoio a preparar antes
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN (
    'pendente', 'agendada', 'decidida', 'arquivada'
  )),
  data_alvo DATE,
  decidida_em TIMESTAMPTZ,
  criado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wr_definicoes_status ON war_room_definicoes(status, data_alvo);


-- =====================================================================
-- 5) war_room_decisoes — ATA (append-only)
--    Marcar uma definição como 'decidida' exige uma linha aqui com
--    definicao_id apontando p/ ela: a decisão fica na ata (imutável); a
--    definição só carrega o status.
-- =====================================================================
CREATE TABLE IF NOT EXISTS war_room_decisoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES war_room_snapshots(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  dono_id UUID REFERENCES auth.users(id),
  prazo DATE,
  acao_id UUID REFERENCES war_room_acoes(id),
  definicao_id UUID REFERENCES war_room_definicoes(id),
  registrado_por UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wr_decisoes_snapshot ON war_room_decisoes(snapshot_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wr_decisoes_acao ON war_room_decisoes(acao_id) WHERE acao_id IS NOT NULL;

-- Append-only: barra DELETE e (quase todo) UPDATE no banco (belt-and-suspenders
-- com a ausência de policy de escrita). Correção de conteúdo = nova linha.
-- EXCEÇÃO CIRÚRGICA: permitir vincular a ação UMA única vez (acao_id NULL→valor),
-- com todas as demais colunas idênticas. Motivo: o vínculo decisão→ação é ESTADO
-- consultável (a view da pauta lê acao_id para saber se a decisão já virou ação);
-- deixá-lo só como evento no ticket criaria falso positivo permanente na pauta
-- (decisão que virou ação cobrando vínculo para sempre). Qualquer outra mutação
-- continua barrada — a ata segue imutável.
REVOKE UPDATE, DELETE ON war_room_decisoes FROM authenticated, anon;

CREATE OR REPLACE FUNCTION wr_decisoes_bloqueia_mutacao() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Ata do War Room é imutável (correção = nova decisão).';
  END IF;
  -- Único UPDATE permitido: acao_id NULL→valor, tudo o mais inalterado.
  IF OLD.acao_id IS NULL AND NEW.acao_id IS NOT NULL
     AND NEW.id           =  OLD.id
     AND NEW.snapshot_id  =  OLD.snapshot_id
     AND NEW.descricao    =  OLD.descricao
     AND NEW.dono_id      IS NOT DISTINCT FROM OLD.dono_id
     AND NEW.prazo        IS NOT DISTINCT FROM OLD.prazo
     AND NEW.definicao_id IS NOT DISTINCT FROM OLD.definicao_id
     AND NEW.registrado_por = OLD.registrado_por
     AND NEW.created_at   =  OLD.created_at
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Ata do War Room é imutável (só é permitido vincular a ação uma vez).';
END $$;

DROP TRIGGER IF EXISTS wr_decisoes_imutavel ON war_room_decisoes;
CREATE TRIGGER wr_decisoes_imutavel
  BEFORE UPDATE OR DELETE ON war_room_decisoes
  FOR EACH ROW EXECUTE FUNCTION wr_decisoes_bloqueia_mutacao();


-- =====================================================================
-- 7) war_room_ponte — fontes da ponte de caixa até dez/2026 (NÚCLEO)
--    O singleton de config da ponte (alvo_total R$ 2M, alvo_data 2026-12-31)
--    vive como constante em src/lib/war-room/constantes.ts (não em tabela).
-- =====================================================================
CREATE TABLE IF NOT EXISTS war_room_ponte (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,                               -- fonte de caixa
  meta NUMERIC NOT NULL,                            -- R$
  realizado NUMERIC NOT NULL DEFAULT 0,             -- atualizado semanalmente
  prazo DATE,
  acao_id UUID REFERENCES war_room_acoes(id),       -- fonte ligada a uma ação do plano
  ordem INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wr_ponte_ordem ON war_room_ponte(ordem);


-- =====================================================================
-- PREDICADOS DE ACESSO (SECURITY DEFINER — leem permissões/lista sem
-- recursão de RLS; só respondem sobre o CHAMADOR auth.uid()).
-- =====================================================================

-- Núcleo: admin/dev do portal OU membro ativo nível 'nucleo'.
CREATE OR REPLACE FUNCTION war_room_nucleo()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM portal_permissoes pp
      WHERE pp.user_id = auth.uid() AND (pp.is_admin IS TRUE OR pp.is_dev IS TRUE)
    )
    OR EXISTS (
      SELECT 1 FROM war_room_membros m
      WHERE m.user_id = auth.uid() AND m.ativo AND m.nivel = 'nucleo'
    )
  );
$$;

-- Está na lista explícita (qualquer nível) OU é núcleo.
CREATE OR REPLACE FUNCTION war_room_na_lista()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT war_room_nucleo() OR EXISTS (
    SELECT 1 FROM war_room_membros m
    WHERE m.user_id = auth.uid() AND m.ativo
  );
$$;


-- =====================================================================
-- RLS — só SELECT. Escrita sempre via service role (rotas /api/war-room/*).
-- =====================================================================
ALTER TABLE war_room_membros    ENABLE ROW LEVEL SECURITY;
ALTER TABLE war_room_membros_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE war_room_acoes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE war_room_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE war_room_decisoes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE war_room_definicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE war_room_ponte      ENABLE ROW LEVEL SECURITY;

-- Membros: cada um enxerga a própria linha (p/ saber "sou núcleo?"); núcleo vê todos.
DROP POLICY IF EXISTS wr_membros_select ON war_room_membros;
CREATE POLICY wr_membros_select ON war_room_membros
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR war_room_nucleo());

-- Log de acesso: auditoria — só núcleo lê.
DROP POLICY IF EXISTS wr_membros_log_select ON war_room_membros_log;
CREATE POLICY wr_membros_log_select ON war_room_membros_log
  FOR SELECT TO authenticated
  USING (war_room_nucleo());

-- Ações: quem está na lista (núcleo ou membro) vê TODAS; dono de ação fora da
-- lista vê só as próprias (responsável/solicitante/participante do ticket).
DROP POLICY IF EXISTS wr_acoes_select ON war_room_acoes;
CREATE POLICY wr_acoes_select ON war_room_acoes
  FOR SELECT TO authenticated
  USING (
    war_room_na_lista()
    OR EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = war_room_acoes.ticket_id
        AND (
          t.solicitante_id = auth.uid()
          OR t.responsavel_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM tickets_participantes p
            WHERE p.ticket_id = t.id AND p.user_id = auth.uid() AND p.removido_em IS NULL
          )
        )
    )
  );

-- Snapshots CRU (com caixa/antecipação): SÓ núcleo. Membro lê a view lite.
DROP POLICY IF EXISTS wr_snapshots_select ON war_room_snapshots;
CREATE POLICY wr_snapshots_select ON war_room_snapshots
  FOR SELECT TO authenticated
  USING (war_room_nucleo());

-- Decisões (ata): núcleo vê tudo; demais veem decisões ligadas às próprias ações.
DROP POLICY IF EXISTS wr_decisoes_select ON war_room_decisoes;
CREATE POLICY wr_decisoes_select ON war_room_decisoes
  FOR SELECT TO authenticated
  USING (
    war_room_nucleo()
    OR (
      acao_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM war_room_acoes a JOIN tickets t ON t.id = a.ticket_id
        WHERE a.id = war_room_decisoes.acao_id
          AND (
            t.solicitante_id = auth.uid()
            OR t.responsavel_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM tickets_participantes p
              WHERE p.ticket_id = t.id AND p.user_id = auth.uid() AND p.removido_em IS NULL
            )
          )
      )
    )
  );

-- Definições estratégicas e ponte de caixa: SÓ núcleo.
DROP POLICY IF EXISTS wr_definicoes_select ON war_room_definicoes;
CREATE POLICY wr_definicoes_select ON war_room_definicoes
  FOR SELECT TO authenticated
  USING (war_room_nucleo());

DROP POLICY IF EXISTS wr_ponte_select ON war_room_ponte;
CREATE POLICY wr_ponte_select ON war_room_ponte
  FOR SELECT TO authenticated
  USING (war_room_nucleo());


-- =====================================================================
-- VIEWS
-- =====================================================================

-- v_war_room_acoes: ação + ticket + dono (nome/avatar). SECURITY DEFINER
-- (default) com o MESMO gate da RLS embutido no WHERE — de propósito: se fosse
-- security_invoker, o JOIN em tickets (RLS por participante) filtraria ações de
-- tickets em que o membro-da-lista não é participante, quebrando "membro vê
-- todas as ações". Aqui, quem está na lista vê todas; dono fora da lista vê só
-- as suas.
DROP VIEW IF EXISTS v_war_room_acoes;
CREATE VIEW v_war_room_acoes AS
  SELECT
    a.id,
    a.ticket_id,
    a.fase,
    a.causa_raiz,
    a.entregavel,
    a.indicador,
    a.meta,
    a.consequencia,
    a.prazo_estrategico,
    a.ordem,
    t.numero,
    t.titulo,
    t.status,
    t.responsavel_id AS dono_id,
    u.nome  AS dono_nome,
    u.avatar_url AS dono_avatar,
    t.ultima_atividade_em,
    (a.prazo_estrategico IS NOT NULL
       AND a.prazo_estrategico < CURRENT_DATE
       AND t.status NOT IN ('fechado', 'cancelado')) AS vencida,
    (a.prazo_estrategico - CURRENT_DATE) AS dias_para_prazo
  FROM war_room_acoes a
  JOIN tickets t ON t.id = a.ticket_id
  LEFT JOIN financeiro_usu u ON u.id = t.responsavel_id
  WHERE war_room_na_lista()
     OR t.solicitante_id = auth.uid()
     OR t.responsavel_id = auth.uid()
     OR EXISTS (
       SELECT 1 FROM tickets_participantes p
       WHERE p.ticket_id = t.id AND p.user_id = auth.uid() AND p.removido_em IS NULL
     );

-- v_war_room_snapshots_lite: o que o MEMBRO enxerga — farol + margem + giro,
-- SEM caixa e SEM volume antecipado. SECURITY DEFINER (default) + gate embutido
-- war_room_na_lista(): é o único caminho de leitura de snapshot p/ não-núcleo
-- (a tabela crua é núcleo-only pela RLS acima).
DROP VIEW IF EXISTS v_war_room_snapshots_lite;
CREATE VIEW v_war_room_snapshots_lite AS
  SELECT
    s.id,
    s.semana_inicio,
    s.margem_semana,
    s.tratores_vendidos,
    s.entradas_patio,
    s.farol_margem,
    s.farol_giro,
    s.farol_caixa,          -- só o FAROL do caixa (verde/amarelo/vermelho), não o valor
    s.pauta_congelada_lite AS pauta_congelada,   -- versão já filtrada (sem caixa/definições)
    s.fechado_em
  FROM war_room_snapshots s
  WHERE war_room_na_lista();

-- v_war_room_pauta: itens da reunião. UNION de:
--  (a) ações vencidas · (b) sentinelas vermelhos do último snapshot ·
--  (c) decisões com prazo estourado sem ação vinculada fechada ·
--  (d) definições pendentes/agendadas com data_alvo nos próximos 7 dias ou estourada.
-- Itens de caixa (b) e todas as definições (d) só aparecem p/ núcleo.
-- SECURITY DEFINER (default) com gates embutidos por linha.
DROP VIEW IF EXISTS v_war_room_pauta;
CREATE VIEW v_war_room_pauta AS
  -- (a) ações vencidas
  SELECT
    'acao_vencida'::text AS tipo,
    a.id AS ref_id,
    t.numero::text AS rotulo,
    t.titulo AS descricao,
    a.prazo_estrategico AS prazo,
    'nao'::text AS so_nucleo
  FROM war_room_acoes a
  JOIN tickets t ON t.id = a.ticket_id
  WHERE a.prazo_estrategico IS NOT NULL
    AND a.prazo_estrategico < CURRENT_DATE
    AND t.status NOT IN ('fechado', 'cancelado')
    AND war_room_na_lista()

  UNION ALL
  -- (b) sentinelas vermelhos do último snapshot (caixa vermelho → só núcleo)
  SELECT
    'sentinela_vermelho'::text,
    s.id,
    farol.nome,
    'Sentinela em vermelho na semana ' || to_char(s.semana_inicio, 'DD/MM'),
    s.semana_inicio,
    CASE WHEN farol.nome = 'caixa' THEN 'sim' ELSE 'nao' END
  FROM war_room_snapshots s
  CROSS JOIN LATERAL (VALUES
    ('margem', s.farol_margem),
    ('giro',   s.farol_giro),
    ('caixa',  s.farol_caixa)
  ) AS farol(nome, valor)
  WHERE s.semana_inicio = (SELECT max(semana_inicio) FROM war_room_snapshots)
    AND farol.valor = 'vermelho'
    AND (war_room_na_lista() AND (farol.nome <> 'caixa' OR war_room_nucleo()))

  UNION ALL
  -- (c) decisões com prazo estourado sem ação vinculada fechada
  SELECT
    'decisao_atrasada'::text,
    d.id,
    'ata'::text,
    d.descricao,
    d.prazo,
    'sim'::text
  FROM war_room_decisoes d
  LEFT JOIN war_room_acoes a ON a.id = d.acao_id
  LEFT JOIN tickets t ON t.id = a.ticket_id
  WHERE d.prazo IS NOT NULL
    AND d.prazo < CURRENT_DATE
    AND (a.id IS NULL OR t.status NOT IN ('fechado', 'cancelado'))
    AND war_room_nucleo()

  UNION ALL
  -- (d) definições pendentes/agendadas com data_alvo próxima (7d) ou estourada
  SELECT
    'definicao_proxima'::text,
    def.id,
    'definicao'::text,
    def.tema,
    def.data_alvo,
    'sim'::text
  FROM war_room_definicoes def
  WHERE def.status IN ('pendente', 'agendada')
    AND def.data_alvo IS NOT NULL
    AND def.data_alvo <= CURRENT_DATE + 7
    AND war_room_nucleo();


-- =====================================================================
-- GRANTS das views. O repo confia nos default privileges do Supabase para
-- tabelas/views novas em public, mas tornamos explícito nas views (custo zero,
-- documenta a intenção). A redação da sensibilidade continua garantida pela RLS
-- da tabela crua (núcleo-only) + o gate embutido nas views DEFINER.
-- =====================================================================
GRANT SELECT ON v_war_room_acoes           TO authenticated;
GRANT SELECT ON v_war_room_snapshots_lite  TO authenticated;
GRANT SELECT ON v_war_room_pauta           TO authenticated;


-- =====================================================================
-- CRIAÇÃO DE AÇÃO: NÃO há RPC. Seguindo o padrão do motor/SC (criarSC em
-- src/app/api/tickets/route.ts), a rota POST /api/war-room/acoes cria em TS via
-- service role, sequencialmente: INSERT tickets (tipo='war_room') → INSERT
-- war_room_acoes → garantirParticipante(dono, núcleo) → registrarEvento
-- ('wr_acao_criada') → notificarTicket. Mesma tolerância a falha parcial que o
-- motor já aceita — evita duplicar a lógica do motor em SQL e mantém a
-- notificação, numero e ultima_atividade_em vindos do mesmo caminho.
--
-- Realtime: as ações do War Room SÃO tickets, então a timeline ao vivo já vem
-- de tickets_eventos (adicionada à publicação em create-tickets.sql). Nada a
-- adicionar aqui.
-- =====================================================================
