-- ============================================================================
-- RASTREIO DE PEÇAS POR UNIDADE (QR na etiqueta) — 11/08/2026
--
-- Cada etiqueta impressa com rastreio ligado vira UMA linha em peca_unidades
-- (o UUID é o conteúdo do QR -> página pública /p/<uuid>). Fluxo:
--   estoque -> retirada_pendente (alguém escaneou e marcou "peguei")
--           -> liberada (departamento de peças liberou)
--           -> aplicada (cron cruzou com o relatório do técnico: peça USADA
--              na OS; ou conclusão manual/balcão)
--   liberada -> devolucao_pendente (relatório marcou não usada/devolvida)
--            -> estoque (balcão conferiu a peça de volta)
--
-- Modelo de acesso (padrão create-tickets.sql):
--   - LEITURA direta pelo browser (authenticated) controlada por RLS;
--     a página pública /p/[id] lê via service role no servidor.
--   - ESCRITA só via rotas /api/pecas/unidades/* (service role) — as regras
--     de transição vivem no server. Por isso NÃO há policies de escrita.
--
-- Snapshot da etiqueta é copiado como TEXTO (conta/codigo/descricao/locacao):
-- produtos_caracteristicas não tem ids estáveis (o sync faz DELETE+INSERT).
-- Idempotente. Rodar no SQL Editor do Supabase.
-- ============================================================================

-- Numeração legível UN-000001 (padrão set_garantia_numero)
CREATE SEQUENCE IF NOT EXISTS peca_unidade_numero_seq START 1;

CREATE TABLE IF NOT EXISTS peca_unidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT UNIQUE,
  lote_id UUID NOT NULL,

  -- snapshot da etiqueta (linha principal + linha alternativa da etiqueta dupla)
  conta_omie TEXT NOT NULL,              -- 'NOVA' | 'CASTRO'
  codigo TEXT NOT NULL,                  -- SKU (texto)
  descricao TEXT NOT NULL DEFAULT '',
  locacao TEXT NOT NULL DEFAULT '',
  alt_conta_omie TEXT,
  alt_codigo TEXT,
  alt_descricao TEXT,
  alt_locacao TEXT,

  status TEXT NOT NULL DEFAULT 'estoque' CHECK (status IN (
    'estoque', 'retirada_pendente', 'liberada', 'aplicada',
    'devolucao_pendente', 'cancelada', 'extraviada'
  )),

  destino_tipo TEXT CHECK (destino_tipo IN ('os', 'balcao', 'uso_interno')),
  destino_os TEXT,                       -- Ordem_Servico.Id_Ordem (texto)
  destino_obs TEXT NOT NULL DEFAULT '',

  retirado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  retirado_por_nome TEXT NOT NULL DEFAULT '',
  retirado_em TIMESTAMPTZ,
  liberado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  liberado_em TIMESTAMPTZ,
  aplicado_em TIMESTAMPTZ,
  devolvido_em TIMESTAMPTZ,

  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_por_nome TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_peca_unidade_numero() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    NEW.numero := 'UN-' || lpad(nextval('peca_unidade_numero_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_peca_unidade_numero ON peca_unidades;
CREATE TRIGGER trg_peca_unidade_numero BEFORE INSERT ON peca_unidades
  FOR EACH ROW EXECUTE FUNCTION set_peca_unidade_numero();

-- Timeline imutável (autor_id NULL = sistema/cron)
CREATE TABLE IF NOT EXISTS peca_unidade_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id UUID NOT NULL REFERENCES peca_unidades(id) ON DELETE CASCADE,
  autor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  autor_nome TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL CHECK (tipo IN (
    'criacao', 'retirada', 'liberacao', 'recusa', 'retirada_cancelada',
    'aplicacao', 'devolucao_marcada', 'devolucao_recebida',
    'cancelamento', 'extravio', 'recuperacao', 'observacao'
  )),
  de_status TEXT,
  para_status TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pu_status       ON peca_unidades(status);
CREATE INDEX IF NOT EXISTS idx_pu_codigo       ON peca_unidades(conta_omie, codigo);
CREATE INDEX IF NOT EXISTS idx_pu_alt_codigo   ON peca_unidades(alt_codigo) WHERE alt_codigo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pu_destino_os   ON peca_unidades(destino_os) WHERE destino_os IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pu_retirado_por ON peca_unidades(retirado_por, status);
CREATE INDEX IF NOT EXISTS idx_pu_lote         ON peca_unidades(lote_id);
CREATE INDEX IF NOT EXISTS idx_pue_unidade     ON peca_unidade_eventos(unidade_id, created_at);

-- RLS: leitura pra authenticated; escrita SÓ service role (sem policies)
ALTER TABLE peca_unidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE peca_unidade_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pu_select_authenticated ON peca_unidades;
CREATE POLICY pu_select_authenticated ON peca_unidades
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS pue_select_authenticated ON peca_unidade_eventos;
CREATE POLICY pue_select_authenticated ON peca_unidade_eventos
  FOR SELECT TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';
