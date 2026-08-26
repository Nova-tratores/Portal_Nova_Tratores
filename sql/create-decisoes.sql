-- =====================================================================
-- LIVRO DE DECISÕES + SOLICITAÇÃO DE COMPRAS (SC) — Portal Nova Tratores
-- Rodar no SQL Editor do Supabase (aplicação manual, como as demais migrations).
--
-- Conceito: governanca_ledger_decisoes_e_comissao_v2.md (Fase 1).
-- Livro-razão de decisões APPEND-ONLY e IMUTÁVEL: cada mudança de estado
-- relevante da SC (criação, ajuste de lote, parecer, emissão de PC) vira um
-- evento assinado por um ator com papel definido. Correção = novo evento que
-- referencia o anterior; nada é editado nem apagado.
--
-- Modelo de acesso (igual ao módulo `tickets`):
--  - LEITURA direta pelo browser (anon key) controlada por RLS: quem tem
--    qualquer permissão do módulo `decisoes` lê tudo (transparência mútua é
--    parte do mecanismo — §1.3 do conceito).
--  - ESCRITA só via rotas /api/decisoes/* (service role). As regras de negócio
--    (transições/alçadas, justificativa obrigatória, encadeamento) vivem no
--    server. Por isso NÃO há policies de INSERT/UPDATE/DELETE para authenticated.
--
-- Imutabilidade: além de "sem policy de escrita", o ledger `decisoes` tem um
-- TRIGGER que barra UPDATE/DELETE no banco (padrão novo no repo, adotado por
-- ser um sistema de auditoria/governança).
--
-- Fase 2 (fora daqui): rastreio por chassi (chassi_id já nasce nullable),
-- alocacao_chassi/venda_faturada/desconto_aprovado e a comissão por margem.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Cabeçalho da SC — MUTÁVEL. É a projeção do estado atual; a VERDADE é o
-- ledger `decisoes`. O service role atualiza `status`/`qtd_atual`/etc. a cada
-- passo do workflow.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS solicitacoes_compra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  status TEXT NOT NULL DEFAULT 'aguardando_diretoria' CHECK (status IN (
    'rascunho', 'aguardando_diretoria', 'aguardando_financeiro',
    'aprovada', 'pc_emitida', 'recusada', 'cancelada'
  )),
  conta_omie TEXT NOT NULL DEFAULT 'NOVA',           -- NOVA | CASTRO
  vendedor_id UUID NOT NULL REFERENCES auth.users(id),
  modelo TEXT NOT NULL DEFAULT '',                   -- modelo/descrição da máquina
  produto_codigo TEXT NOT NULL DEFAULT '',           -- SKU/código Omie (opcional)
  cliente_codigo TEXT NOT NULL DEFAULT '',           -- cliente vinculado (opcional)
  pedido_venda_ref TEXT NOT NULL DEFAULT '',         -- PV vinculado (opcional)
  qtd_solicitada INT NOT NULL DEFAULT 1,
  qtd_atual INT NOT NULL DEFAULT 1,                  -- após ajuste da diretoria
  preco_alvo NUMERIC,                                -- preço-alvo por unidade
  pc_numero TEXT NOT NULL DEFAULT '',                -- nº do Pedido de Compra no Omie
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,        -- extensão por tipo (Fase 2)
  ultima_atividade_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Livro de Decisões — APPEND-ONLY / IMUTÁVEL. O coração da governança.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS decisoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ocorrida_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  ator_id UUID REFERENCES auth.users(id),            -- NULL = evento do sistema
  papel TEXT NOT NULL CHECK (papel IN (
    'comercial', 'diretoria_compras', 'financeiro', 'comprador', 'sistema'
  )),
  tipo TEXT NOT NULL CHECK (tipo IN (
    'sc_criada', 'qtd_alterada', 'parecer_financeiro', 'pc_emitido',
    'alocacao_chassi', 'desconto_aprovado', 'venda_faturada',
    'correcao', 'cancelamento', 'comentario'
  )),
  sc_id UUID NOT NULL REFERENCES solicitacoes_compra(id) ON DELETE CASCADE,
  documento_ref TEXT,                                -- SC / PC / PV / NF
  chassi_id UUID,                                    -- nullable — Fase 2
  decisao_anterior UUID REFERENCES decisoes(id),     -- encadeamento (pareceres, correções)
  estado_anterior JSONB,
  estado_novo JSONB,
  justificativa TEXT NOT NULL,                       -- obrigatória (RPC/server rejeita vazia)
  prazo_compromisso DATE                             -- ex.: "liquidar até"
);

-- ---------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_decisoes_sc ON decisoes(sc_id, ocorrida_em);
CREATE INDEX IF NOT EXISTS idx_decisoes_ator ON decisoes(ator_id, papel);
CREATE INDEX IF NOT EXISTS idx_decisoes_compromisso ON decisoes(prazo_compromisso) WHERE prazo_compromisso IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sc_status ON solicitacoes_compra(status);
CREATE INDEX IF NOT EXISTS idx_sc_vendedor ON solicitacoes_compra(vendedor_id, status);
CREATE INDEX IF NOT EXISTS idx_sc_atividade ON solicitacoes_compra(ultima_atividade_em DESC);

-- ---------------------------------------------------------------------
-- Imutabilidade do ledger: barra UPDATE/DELETE no banco (belt-and-suspenders
-- com a ausência de policy de escrita). Correção = INSERT de novo evento
-- tipo='correcao' com decisao_anterior apontando o corrigido.
-- ---------------------------------------------------------------------
REVOKE UPDATE, DELETE ON decisoes FROM authenticated, anon;

CREATE OR REPLACE FUNCTION decisoes_bloqueia_mutacao() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Livro de decisões é imutável (correção = novo evento).';
END $$;

DROP TRIGGER IF EXISTS decisoes_imutavel ON decisoes;
CREATE TRIGGER decisoes_imutavel
  BEFORE UPDATE OR DELETE ON decisoes
  FOR EACH ROW EXECUTE FUNCTION decisoes_bloqueia_mutacao();

-- ---------------------------------------------------------------------
-- Visibilidade (usada nas policies de SELECT). SECURITY DEFINER para ler
-- permissões sem recursão de RLS. Transparência mútua: quem tem qualquer
-- permissão do módulo `decisoes` lê todas as SCs e decisões.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION decisoes_pode_ver()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM portal_permissoes pp
    WHERE pp.user_id = auth.uid()
      AND (
        pp.is_admin IS TRUE
        OR pp.is_dev IS TRUE
        OR 'decisoes' = ANY(pp.modulos_permitidos)
        OR EXISTS (
          SELECT 1 FROM unnest(pp.modulos_permitidos) m WHERE m LIKE 'decisoes:%'
        )
      )
  );
$$;

-- ---------------------------------------------------------------------
-- RLS — leitura por permissão; escrita bloqueada (só service role)
-- ---------------------------------------------------------------------
ALTER TABLE solicitacoes_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sc_select ON solicitacoes_compra;
CREATE POLICY sc_select ON solicitacoes_compra
  FOR SELECT TO authenticated
  USING (decisoes_pode_ver());

DROP POLICY IF EXISTS decisoes_select ON decisoes;
CREATE POLICY decisoes_select ON decisoes
  FOR SELECT TO authenticated
  USING (decisoes_pode_ver());

-- ---------------------------------------------------------------------
-- Realtime (timeline ao vivo na tela de detalhe; schema public → não quebra
-- o chat, ao contrário de schema dedicado). Entrega respeita a RLS.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE decisoes;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
